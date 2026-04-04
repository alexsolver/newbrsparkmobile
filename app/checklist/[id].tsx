import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, Image, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Network from 'expo-network';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanResponder } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Ionicons, AntDesign, Entypo, Feather, FontAwesome, FontAwesome5, Foundation, MaterialIcons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { apiFetch } from '../../src/services/auth';
import { LinearGradient } from 'expo-linear-gradient';
import GeofenceStatusBar from './GeofenceStatusBar';
import GeofenceMapScreen from './GeofenceMapScreen';
import RouteProgressBar from './RouteProgressBar';
import LiveRouteMapCard from './LiveRouteMapCard';
import { routeTracker } from '../../src/services/routeTrackingService';
import { dataCollectionService } from '../../src/services/dataCollectionService';


export default function ChecklistEngine() {
  const { id, taskId } = useLocalSearchParams();
  const router = useRouter();
  
  const [template, setTemplate] = useState<any>(null);
  const [responses, setResponses] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Geofence map state (Opção B)
  const [showGeoMap, setShowGeoMap]         = useState(false);
  const [currentTask, setCurrentTask]       = useState<any>(null);
  const [geoMapChecked, setGeoMapChecked]   = useState(false);
  const [geofenceFailMode, setGeofenceFailMode] = useState<'block'|'warn'>('warn');
  
  // Scanner Modal & Virtual Camera State
  const [showScanner, setShowScanner] = useState(false);
  const [scannerFieldId, setScannerFieldId] = useState<string | null>(null);
  
  // -- Novo Estado de Webhook API --
  const [validatingFieldId, setValidatingFieldId] = useState<string|null>(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = React.useRef<any>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  // Live route map state (após Iniciar Deslocamento)
  const [showLiveMap, setShowLiveMap]       = useState(false);
  // Tracking share link state
  const [trackingUrl, setTrackingUrl]       = useState<string|null>(null);


  const [sigModalVisible, setSigModalVisible] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [currentSigField, setCurrentSigField] = useState<string|null>(null);
  const [currentStrokeState, setCurrentStrokeState] = useState<string>('');
  const currentStrokeRef = React.useRef<string>('');
  const [completedStrokes, setCompletedStrokes] = useState<string[]>([]);
  
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const initial = `M${locationX},${locationY}`;
        currentStrokeRef.current = initial;
        setCurrentStrokeState(initial);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const updated = `${currentStrokeRef.current} L${locationX},${locationY}`;
        currentStrokeRef.current = updated;
        setCurrentStrokeState(updated);
      },
      onPanResponderRelease: () => {
        const strokeToSave = currentStrokeRef.current;
        if (strokeToSave) {
           setCompletedStrokes((prev) => {
             const arr = [...prev, strokeToSave];
             return arr;
           });
        }
        currentStrokeRef.current = '';
        setCurrentStrokeState('');
      },
    })
  ).current;

  const saveSignature = async () => {
      if(completedStrokes.length === 0 && currentStrokeRef.current === '') {
          setSigModalVisible(false);
          return;
      }
      setSavingSignature(true);
      try {
          const allStrk = [...completedStrokes];
          if(currentStrokeRef.current !== '') allStrk.push(currentStrokeRef.current);
          
          let meta = { lat: 0, lng: 0, address: "Localização Desconhecida", ip: "Desconhecido" };
          try {
             // Forçando api.ipify.org para retornar o IP clássico (IPv4 - ex: 177.34.20.1)
             // Sem o "64" ele não trará o IP de nova geração (IPv6 - com letras e dois pontos)
             const ipReq = await fetch('https://api.ipify.org/?format=json');
             const ipJson = await ipReq.json();
             if (ipJson.ip) meta.ip = ipJson.ip;
          } catch(e) {}

          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
             try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                meta.lat = loc.coords.latitude;
                meta.lng = loc.coords.longitude;
                const geocoded = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                if (geocoded.length > 0) meta.address = `${geocoded[0].street || ''}, ${geocoded[0].streetNumber || ''} - ${geocoded[0].city || ''}, ${geocoded[0].region || ''}`;
             } catch(e) {}
          }
          
          const metaStr = `meta:${JSON.stringify(meta)}`;
          handleInput(currentSigField as string, "SIG_V1|" + metaStr + "|" + allStrk.join('|'));
      } catch(e) {
          Alert.alert("Aviso", "A assinatura foi salva sem todos os metadados ativos (GPS lento ou sem rede offline).");
          // Fallback just in case
          const allStrk = [...completedStrokes];
          if(currentStrokeRef.current !== '') allStrk.push(currentStrokeRef.current);
          handleInput(currentSigField as string, "SIG_V1|" + allStrk.join('|'));
      } finally {
          setSavingSignature(false);
          setSigModalVisible(false);
      }
  };

  const ensureOnlineValidation = async (field: any, action: () => void | Promise<void>) => {
      if (field.requireOnlineValidation) {
          try {
              const netState = await Network.getNetworkStateAsync();
              if (!netState.isConnected) {
                  Alert.alert(
                      "Validação Online Obrigatória",
                      "Esta etapa da OS possui regras de segurança e não pode ser preenchida offline.\n\nPor favor, conecte-se à internet para continuar.",
                      [{ text: "OK" }]
                  );
                  return;
              }
          } catch (e) {
              Alert.alert("Erro de Conexão", "Não foi possível verificar a conectividade.");
              return;
          }
      }
      await action();
  };

  const processFacialImage = async (fieldId: string, imgBase64: string, imgUri: string) => {
      const fieldData = template.schemaData.find((f: any) => f.id === fieldId);
      if (fieldData?.requireOnlineValidation) {
          try {
              const rawResp = await apiFetch('/api/vision/verify-face', {
                  method: 'POST',
                  body: JSON.stringify({ 
                     imageBase64: imgBase64,
                     provider: fieldData.visionProvider || 'AUTO'
                  })
              });
              const apiResp = await rawResp.json();
              if (apiResp.error) {
                  Alert.alert("Erro de Reconhecimento", apiResp.error);
                  return false;
              }
              if (!apiResp.match) {
                  Alert.alert("Rosto não reconhecido", "A biometria facial falhou em comparar o rosto. Você não possui autorização para este formulário.");
                  return false;
              }
          } catch (err: any) {
              Alert.alert("Falha no Motor de IA", "Não foi possível conectar ao servidor para validação biométrica.");
              return false;
          }
      }
      handleInput(fieldId, imgUri);
      return true;
  };

  const handleMediaPicker = async (fieldId: string, type: string) => {
      if (type === 'file_upload') {
          try {
             const res = await DocumentPicker.getDocumentAsync({});
             if (!res.canceled && res.assets && res.assets.length > 0) {
                 handleInput(fieldId, res.assets[0].uri);
             }
          } catch(e) {}
      } else {
          try {
             if (type === 'photo_stamped' || type === 'facial_recognition') {
                 
                 // Intercept custom camera mode for facial recognition
                 if (type === 'facial_recognition') {
                     const fieldData = template?.schemaData?.find((f: any) => f.id === fieldId);
                     console.log("[DEBUG] fieldId:", fieldId, "fieldData.cameraMode:", fieldData?.cameraMode);
                     
                     if (fieldData?.cameraMode === 'scanner') {
                         console.log("[DEBUG] Trying scanner mode...");
                         if (!cameraPermission?.granted) {
                             console.log("[DEBUG] Requesting camera permission...");
                             try {
                                 const p = await requestCameraPermission();
                                 if (!p.granted) return Alert.alert("Atenção", "Permissão negada para câmera virtual.");
                             } catch (permErr: any) {
                                 console.log("[DEBUG] Permission error:", permErr);
                             }
                         }
                         setScannerFieldId(fieldId);
                         setShowScanner(true);
                         return; // Modal will handle the capture
                     }
                 }

                 try {
                     const { status } = await ImagePicker.requestCameraPermissionsAsync();
                     if (status !== 'granted') return Alert.alert("Atenção", "Permissão negada para câmera nativa.");
                     
                     const res = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
                     if (!res.canceled && res.assets && res.assets.length > 0) {
                         const imgAsset = res.assets[0];

                         let gpsQuery = "?live=true";
                         try {
                             const loc = await Location.getLastKnownPositionAsync({}) || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                             if (loc && loc.coords) {
                                 const { latitude, longitude } = loc.coords;
                                 gpsQuery += `&lat=${latitude}&lng=${longitude}`;
                                 try {
                                     const rev = await Location.reverseGeocodeAsync({ latitude, longitude });
                                     if (rev && rev.length > 0) {
                                        const r = rev[0];
                                        const addr = `${r.street || r.name}, ${r.streetNumber || 'S/N'} - ${r.subregion || r.city || r.district || r.region}`;
                                        gpsQuery += `&addr=${encodeURIComponent(addr)}`;
                                     }
                                 } catch(e) {}
                             }
                         } catch(e) {}

                         if (type === 'facial_recognition') {
                             const ok = await processFacialImage(fieldId, imgAsset.base64 || '', imgAsset.uri + gpsQuery);
                             if (!ok) return;
                         } else {
                             handleInput(fieldId, imgAsset.uri + gpsQuery);
                         }
                     }
                 } catch (err: any) {
                     Alert.alert("Câmera Indisponível", err.message || "Erro ao tentar abrir a câmera.");
                 }
             } else {
                 Alert.alert("Adicionar Foto", "Importar foto de onde?", [
                    { text: "Câmera", onPress: async () => {
                        try {
                            const { status } = await ImagePicker.requestCameraPermissionsAsync();
                            if (status !== 'granted') {
                                Alert.alert("Atenção", "Permissão negada para câmera.");
                                return;
                            }
                            const res = await ImagePicker.launchCameraAsync({ quality: 0.5 });
                            if (!res.canceled && res.assets && res.assets.length > 0) handleInput(fieldId, res.assets[0].uri);
                        } catch (camErr: any) {
                            Alert.alert("Câmera Indisponível", camErr.message || "Não foi possível abrir a câmera. Você está em um simulador?");
                        }
                    }},
                    { text: "Galeria", onPress: async () => {
                        try {
                            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                            if (status !== 'granted') {
                                Alert.alert("Atenção", "Permissão negada para galeria.");
                                return;
                            }
                            const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
                            if (!res.canceled && res.assets && res.assets.length > 0) handleInput(fieldId, res.assets[0].uri);
                        } catch (galErr: any) {
                            Alert.alert("Galeria Indisponível", galErr.message || "Erro ao abrir a galeria.");
                        }
                    }},
                    { text: "Cancelar", style: "cancel" }
                 ]);
             }
          } catch(e: any) {
              Alert.alert("Erro", "Erro geral na captura de mídia.");
          }
      }
  };

  // --- Geo Engine: Haversine distance (meters) ---
  const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // --- Geo Engine: Point-in-polygon (Ray Casting) ---
  const pointInPolygon = (lat: number, lng: number, polygon: number[][]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1], yi = polygon[i][0]; // [lat,lng] → use lng as X, lat as Y
      const xj = polygon[j][1], yj = polygon[j][0];
      const intersect =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // --- Location handler (Transit + Geofence) ---
  // --- Tracking Link ──────────────────────────────────────────────
  const generateTrackingLink = async () => {
    if (!taskId) return;
    try {
      const res = await apiFetch(`/api/tracking/start/${taskId}`, { method: 'POST' });
      if (res?.url) {
        setTrackingUrl(res.url);
      }
    } catch(e) {
      console.warn('[tracking] could not generate link', e);
    }
  };

  const endTrackingLink = async () => {
    if (!taskId) return;
    try { await apiFetch(`/api/tracking/end/${taskId}`, { method: 'POST' }); }
    catch(e) { console.warn('[tracking] could not end link', e); }
  };
  // ───────────────────────────────────────────────────

  const handleTransit = async (fieldId: string, label: string, traversedPath?: number[][]) => {
    const isGeofenceCheck = label === 'VALIDACAO_CERCA';
    try {
      setSubmitting(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      let lat = 0;
      let lng = 0;
      let address = "Localização não capturada";
      
      if (status === 'granted') {
          try {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
              lat = loc.coords.latitude;
              lng = loc.coords.longitude;
              
              try {
                 const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
                 if (rev && rev.length > 0) {
                    const p = rev[0];
                    address = `${p.street || p.name || ''}, ${p.streetNumber || ''} - ${p.district || p.subregion || ''}, ${p.city || ''} - ${p.region || ''}`;
                 }
              } catch (e) {}
          } catch(e) {
              address = "Falha ao obter coordenadas do GPS";
          }
      } else {
          address = "Permissão de GPS negada pelo usuário";
      }

      // ── Geofencing Validation Engine ──────────────────────────
      if (isGeofenceCheck && lat !== 0 && lng !== 0) {
        // Resolve the field config for fail mode / error message / radius override
        const geoField = template?.schemaData?.find((f: any) => f.id === fieldId);
        const failMode: string = geoField?.geofenceFailMode || 'block';
        const customMsg: string = geoField?.geofenceErrorMsg || '';
        const fieldRadius: number = parseInt(geoField?.geofenceRadius) || 150;
        const zoneType: string = geoField?.geofenceType || 'radius';

        // Load task location from cloudTasks cache
        let taskLocation: any = null;
        try {
          const cloudTasksStr = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
          const cloudTasks = JSON.parse(cloudTasksStr);
          const thisTask = cloudTasks.find((t: any) => String(t.id) === String(taskId));
          if (thisTask) taskLocation = thisTask;
        } catch(e) {}

        if (!taskLocation || (!taskLocation.locationLat && !taskLocation.locationPolygon)) {
          // No location on task — just record GPS evidence, do NOT block
          const payload = { action: label, timestamp: new Date().toISOString(), coordinates: { lat, lng }, address, geofence: { validated: false, reason: 'NO_TASK_LOCATION' } };
          handleInput(fieldId, JSON.stringify(payload));
          Alert.alert("⚠️ Localização Registrada", `GPS capturado com sucesso.\n\n📍 ${address}\n\nEsta OS não possui zona de geofencing definida — nenhuma validação aplicada.`);
          return;
        }

        let insideZone = false;
        let distanceMeters: number | null = null;
        let requiredMeters: number | null = null;

        if (zoneType === 'polygon' && taskLocation.locationPolygon) {
          // Ray-casting para polígono
          const polygon: number[][] = typeof taskLocation.locationPolygon === 'string'
            ? JSON.parse(taskLocation.locationPolygon)
            : taskLocation.locationPolygon;
          insideZone = pointInPolygon(lat, lng, polygon);
        } else if (taskLocation.locationLat && taskLocation.locationLng) {
          // Haversine para ponto + raio
          const destLat = parseFloat(taskLocation.locationLat);
          const destLng = parseFloat(taskLocation.locationLng);
          const effectiveRadius = taskLocation.locationRadius || fieldRadius;
          distanceMeters = Math.round(haversineDistance(lat, lng, destLat, destLng));
          requiredMeters = effectiveRadius;
          insideZone = distanceMeters <= effectiveRadius;
        }

        const evidencePayload: any = {
          action: label,
          timestamp: new Date().toISOString(),
          coordinates: { lat, lng },
          address,
          geofence: {
            validated: true,
            mode: failMode,
            insideZone,
            distanceMeters,
            requiredMeters,
            zoneType
          }
        };

        handleInput(fieldId, JSON.stringify(evidencePayload));

        if (insideZone) {
          const distMsg = distanceMeters !== null ? `\n📏 Distância: ${distanceMeters}m (raio: ${requiredMeters}m)` : '';
          Alert.alert("✅ Cerca Eletrônica: APROVADO", `Você está dentro da zona de serviço autorizada.${distMsg}\n\n📍 ${address}`);
        } else {
          const distMsg = distanceMeters !== null
            ? `\n📏 Você está a ${distanceMeters}m do local (máx. ${requiredMeters}m).`
            : '\nVocê está fora do polígono de serviço.';
          const errorMsg = customMsg || `Acesso negado: fora da área de serviço autorizada.${distMsg}`;

          if (failMode === 'block') {
            // Remove a resposta para bloquear o avanço
            handleInput(fieldId, '');
            Alert.alert("🚫 Cerca Eletrônica: BLOQUEADO", `${errorMsg}\n\n📍 Sua posição: ${address}`);
          } else {
            // Modo warn: registra desvio mas permite continuar
            Alert.alert("⚠️ Cerca Eletrônica: ALERTA", `${errorMsg}\n\nO desvio foi registrado como evidência. Você pode continuar.`);
          }
        }
        return;
      }
      // ─────────────────────────────────────────────────────────

      const payload: any = {
         action: label,
         timestamp: new Date().toISOString(),
         coordinates: { lat, lng },
         address: address
      };
      
      if (traversedPath && traversedPath.length > 0) {
          payload.traversedPath = traversedPath;
      }
      
      handleInput(fieldId, JSON.stringify(payload));
      
      // Auto-encerrar o public link se for evento de CHEGADA
      if (label === 'CHEGADA') {
          endTrackingLink();
      }
      
      if (status !== 'granted' || lat === 0) {
          Alert.alert("Atenção", `${label} registrado às ${new Date().toLocaleTimeString('pt-BR')}, mas sem rastreio de GPS.\nMotivo: ${address}`);
      } else {
          Alert.alert("Sucesso", `${label} registrado com sucesso!\n\n${address}`);
      }
    } catch (e) {
      Alert.alert("Erro Inesperado", "Ocorreu um erro ao tentar processar a operação.");
    } finally {
      setSubmitting(false);
    }
  };



    // Sincronização passiva do Kanban (Ping)
  const notifyKanbanStatus = async (status: 'ACCEPTED' | 'IN_PROGRESS') => {
      if (!taskId) return;
      try {
          const key = `@brspark_notified_${taskId}_${status}`;
          if (await AsyncStorage.getItem(key)) return;
          
          const ts = new Date().toISOString();
          
          // Gravação local forte para garantir que vai no payload final caso o ping falhe
          try {
             const cloudTasksStr = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
             let cloudTasks = JSON.parse(cloudTasksStr);
             const idx = cloudTasks.findIndex((t: any) => String(t.id) === String(taskId));
             if (idx > -1) {
                 cloudTasks[idx].metadata = cloudTasks[idx].metadata || {};
                 if (status === 'ACCEPTED') cloudTasks[idx].metadata.acceptedAt = ts;
                 await AsyncStorage.setItem('@brspark_cloud_tasks', JSON.stringify(cloudTasks));
             }
          } catch(err) {}

          apiFetch(`/api/checklists/executions/${taskId}/status`, {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ status, timestamp: ts })
          }).then(() => AsyncStorage.setItem(key, 'true')).catch(() => {});
      } catch(e) {}
  };

  useEffect(() => {
      if (taskId && !isReadOnly) {
         notifyKanbanStatus('ACCEPTED');
         // Técnico aceitou a OS — GPS no modo leve (aguardando saída)
         AsyncStorage.getItem('@brspark_email').then(email => {
           dataCollectionService.setState('DISPATCHED', {
             executionId: String(taskId),
             ownerEmail: email || 'unknown',
           }).catch(() => {});
         });
      }
  }, [taskId, isReadOnly]);

  // Sincronização em tempo real das respostas (Debounced)
  useEffect(() => {
     if (isReadOnly || !taskId || Object.keys(responses).length === 0) return;
     
     const timeoutId = setTimeout(() => {
         apiFetch(`/api/checklists/executions/${taskId}/status`, {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ responses })
         }).catch(() => {});
     }, 2000); // 2 second debounce
     
     return () => clearTimeout(timeoutId);
  }, [responses, taskId, isReadOnly]);


  // Poller to update ETA in real-time — fetches directly from server so it works
  // even while the user is inside this screen (the home screen pullTasks doesn't run here)
  useEffect(() => {
    if (!taskId || isReadOnly) return;
    
    const fetchEta = async () => {
      try {
        // First try local cache (fast)
        const cloudTasksStr = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
        const cloudTasks = JSON.parse(cloudTasksStr);
        const cachedTask = cloudTasks.find((t: any) => String(t.id) === String(taskId));
        if (cachedTask?.etaMinutes != null) {
          setCurrentTask((prev: any) => {
            if (!prev || prev.etaMinutes === cachedTask.etaMinutes) return prev;
            return { ...prev, etaMinutes: cachedTask.etaMinutes };
          });
        }

        // Then fetch fresh ETA directly from server (resolves even if cache is stale)
        const res = await apiFetch(`/api/checklists/executions/${taskId}`);
        if (res.ok) {
          const { trackingUrl: tUrl } = await res.json();
          setTrackingUrl(tUrl);
          const data = await res.json();
          if (data.etaMinutes != null) {
            // Update local cache
            const updatedTasks = cloudTasks.map((t: any) =>
              String(t.id) === String(taskId) ? { ...t, etaMinutes: data.etaMinutes } : t
            );
            await AsyncStorage.setItem('@brspark_cloud_tasks', JSON.stringify(updatedTasks));
            // Update state
            setCurrentTask((prev: any) => {
              if (!prev) return prev;
              return { ...prev, etaMinutes: data.etaMinutes };
            });
          }
        }
      } catch(e) {
        // Offline: silent
      }
    };

    fetchEta(); // Run immediately on mount
    const interval = setInterval(fetchEta, 15000); // Then every 15s
    return () => clearInterval(interval);
  }, [taskId, isReadOnly]);


  useEffect(() => {
    loadTemplate();
    // Stop route tracking when leaving the checklist
    return () => { routeTracker.stop().catch(() => {}); };
  }, [id]);

  const loadTemplate = async () => {
    try {
      const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
      let execs = [];
      try { execs = JSON.parse(executedStr); } catch(e){}
      if (!Array.isArray(execs)) execs = [];
      
      const isCompleted = taskId && execs.some(e => (typeof e === 'string' ? e : e.id) === String(taskId));
      
      let realTemplateId = id as string;
      let initialRes: any = {};
      
      // PASSO 1: Resolve a Execução PRIMEIRO. Se for um ghost antigo, o ID passado era o taskId e não o templateId. 
      // Ao baixar a execução, extraímos o verdadeiro templateId dela!
      if (isCompleted) {
         setIsReadOnly(true);
         let execStr = await AsyncStorage.getItem(`@brspark_execution_${taskId}`);
         let needFetch = !execStr;
         
         if (execStr) {
             try {
                const cachedObj = JSON.parse(execStr);
                if (cachedObj._cacheTime) {
                   const ageHours = (Date.now() - cachedObj._cacheTime) / (1000 * 60 * 60);
                   if (ageHours > 4) needFetch = true;
                }
             } catch(e) {}
         }

         if (needFetch) {
             const outboxStr = await AsyncStorage.getItem('@brspark_outbox') || '[]';
             let outbox = [];
             try { outbox = JSON.parse(outboxStr); } catch(e){}
             if (!Array.isArray(outbox)) outbox = [];
             const match = outbox.find((o:any) => o.taskId === taskId);
             
             if (match) {
                 initialRes = match.responses || {};
                 if (match.templateId) realTemplateId = match.templateId;
             } else {
                 try {
                     const res = await apiFetch(`/api/checklists/executions/${taskId}`);
                     if (res.ok) {
                         const remoteExec = await res.json();
                         initialRes = remoteExec.responses || {};
                         if (remoteExec.templateId) realTemplateId = remoteExec.templateId;
                         // Salva cash local incluindo o templateId real
                         const cachePayload = { ...remoteExec, responses: initialRes, _cacheTime: Date.now() };
                         await AsyncStorage.setItem(`@brspark_execution_${taskId}`, JSON.stringify(cachePayload));
                     } else if (res.status === 404) {
                         // A execução ainda não existe no backend (OS Virgem), segue com form vazio.
                         initialRes = {};
                     } else {
                         Alert.alert('Aviso', 'Servidor retornou erro ou você está offline.');
                         router.back();
                         return;
                     }
                 } catch (e) {
                     Alert.alert('Aviso', 'Você esta Offline, para acessar esta Atividade você precisa estar Online');
                     router.back();
                     return;
                 }
             }
         } else {
             try { 
                 const cachedObj = JSON.parse(execStr || '{}');
                 initialRes = cachedObj.responses || {}; 
                 if (cachedObj.templateId) realTemplateId = cachedObj.templateId;
             } catch(e) {}
         }
      } else {
         const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
         const draftStr = await AsyncStorage.getItem(draftKey);
         initialRes = draftStr ? JSON.parse(draftStr) : {};
      }

      // PASSO 2: Baixa o Template usando o realTemplateId
      const dbStr = await AsyncStorage.getItem('@brspark_templates');
      let db = dbStr ? JSON.parse(dbStr) : {};
      let tmpl = null;
      
      try {
         const res = await apiFetch(`/api/checklists/templates/${realTemplateId}?_t=${Date.now()}`);
         if (res.ok) {
            tmpl = await res.json();
            db[realTemplateId] = tmpl;
            await AsyncStorage.setItem('@brspark_templates', JSON.stringify(db));
         } else {
            throw new Error('Fallback Offline'); // Vai pro catch e tenta usar o db[realTemplateId]
         }
      } catch (e) {
         tmpl = db[realTemplateId];
         if (!tmpl) {
            Alert.alert("Aviso", "Você esta Offline, para acessar esta Atividade você precisa estar Online");
            router.back();
            return;
         }
      }
      
      setTemplate(tmpl);

      // Injetar Default Values (AutoFill) para campos vazios
      if (tmpl.schemaData) {
        tmpl.schemaData.forEach((f: any) => {
          if (!initialRes[f.id] && f.defaultValue) {
             let auto = String(f.defaultValue);
             auto = auto.replace(/{{date}}/g, new Date().toLocaleDateString('pt-BR'));
             auto = auto.replace(/{{time}}/g, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
             auto = auto.replace(/{{user\.name}}/g, 'Técnico Atual'); // Mock temporário
             initialRes[f.id] = auto;
          }
        });
      }
      setResponses(initialRes);
      setStartTime(Date.now());

      // ── Opção B: Carregar task e mostrar mapa de confirmação ──────
      let shouldShowMap = false;
      if (taskId && !isReadOnly) {
        try {
          const cloudTasksStr = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
          const cloudTasks = JSON.parse(cloudTasksStr);
          const thisTask = cloudTasks.find((t: any) => String(t.id) === String(taskId));
          console.log('[GeoMap] taskId=', taskId, '| task found=', !!thisTask, '| locationZoneType=', thisTask?.locationZoneType);
          if (thisTask) {
            setCurrentTask(thisTask);
            const geoField = tmpl.schemaData?.find((f: any) => f.type === 'geofence_check');
            const fm = geoField?.geofenceFailMode || 'warn';
            setGeofenceFailMode(fm as 'block' | 'warn');
            if (thisTask.locationZoneType === 'route' || thisTask.locationZoneType === 'segment') {
              shouldShowMap = true;
              setShowGeoMap(true);
              console.log('[GeoMap] ✅ Mostrando mapa para zona (ROTA/SEGMENTO):', thisTask.locationZoneType);
            } else {
              console.log('[GeoMap] ⏭ Tarefa não é rota. Pulando mapa de aceite. locationZoneType=', thisTask?.locationZoneType);
            }
          } else {
            console.log('[GeoMap] ⚠️ Task não encontrada no cache. Total no cache:', cloudTasks.length);
          }
        } catch(e) { console.error('[GeoMap] erro:', e); }
      } else {
        console.log('[GeoMap] sem taskId ou readOnly — taskId=', taskId, 'isReadOnly=', isReadOnly);
      }

      // Only mark loading done after geo state is set — prevents form flash
      setLoading(false);

      if (tmpl.settings?.requireGlobalGeofence) {
        verifyGlobalGeofence(tmpl.settings.globalGeofenceRadius);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const verifyGlobalGeofence = async (radius: number) => {
    console.log(`[WFM] Validando Geofence de ${radius}m...`);
  };

  const applyMask = (rawValue: string, mask?: string) => {
    if (!mask) return rawValue;
    const clean = String(rawValue).replace(/[^A-Za-z0-9]/g, '');
    let result = '';
    let cleanIdx = 0;
    for (let i = 0; i < mask.length; i++) {
        if (cleanIdx >= clean.length) break;
        if (mask[i] === '#') {
           result += clean[cleanIdx];
           cleanIdx++;
        } else {
           result += mask[i];
        }
    }
    return result;
  };

    const handleInput = (fieldId: string, value: any) => {
    if (Object.keys(responses).length === 0) {
        // Primeira interação de fato do usuário configurará "Em andamento"
        notifyKanbanStatus('IN_PROGRESS');
    }
    if (isReadOnly) return;
    
    // Ignora timestamping para metadados invisíveis
    const isMetaField = fieldId.startsWith('__');
    const timeKey = `__time_${fieldId}`;
    
    const newRes = { 
        ...responses, 
        [fieldId]: value,
        ...(isMetaField ? {} : { [timeKey]: new Date().toISOString() })
    };
    
    setResponses(newRes);
    // AutoSave specifically for this task instance
    const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
    AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
    
    // Register as "IN_PROGRESS" on first input
    if (taskId) {
       AsyncStorage.getItem('@brspark_inprogress_tasks').then(str => {
          let inprogs = [];
          try { inprogs = JSON.parse(str || '[]'); } catch(e){}
          if (!Array.isArray(inprogs)) inprogs = [];
          
          if (!inprogs.includes(String(taskId))) {
             inprogs.push(String(taskId));
             AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(inprogs));
          }
       });
    }
  };

  const submitExecution = async () => {
    setSubmitting(true);
    try {
      // Registrar que a tarefa (OS) foi executada para mover para 'Concluídas'
      if (taskId) {
          const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
          let execs = [];
          try { execs = JSON.parse(executedStr); } catch(e) {}
          if (!Array.isArray(execs)) execs = [];
          
          const existingIdx = execs.findIndex(e => (typeof e === 'string' ? e : e.id) === String(taskId));
          const completedItem = { id: String(taskId), refId: String(id), title: template?.title || 'OS', description: 'OS Concluída com sucesso', completedAt: new Date().toISOString() };
          
          if (existingIdx === -1) {
             execs.push(completedItem);
          } else {
             execs[existingIdx] = completedItem;
          }
          await AsyncStorage.setItem('@brspark_executed_tasks', JSON.stringify(execs));
          
          // Remover status de "Em Andamento" se existia
          const inprogStr = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
          let inprogs = [];
          try { inprogs = JSON.parse(inprogStr); } catch(e) {}
          if (!Array.isArray(inprogs)) inprogs = [];
          
          inprogs = inprogs.filter((t: string) => t !== String(taskId));
          await AsyncStorage.setItem('@brspark_inprogress_tasks', JSON.stringify(inprogs));
      }

      const AuthSvc = require('../../src/services/auth').AuthService;
      let uEmail = 'unknown@empresa.com';
      try {
          const u = await AuthSvc.getCurrentUser();
          if (u && u.email) uEmail = u.email;
      } catch(e) {}
      
      // Resgatar recebimento ou aceite originais
      let origMeta: any = {};
      try {
          const cloudTasksStr = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
          const cloudTasks = JSON.parse(cloudTasksStr);
          const origTask = cloudTasks.find((t: any) => String(t.id) === String(taskId));
          if (origTask && origTask.metadata) {
             origMeta = {
               receivedAt: origTask.metadata.receivedAt,
               acceptedAt: origTask.metadata.acceptedAt
             };
          }
      } catch(e) {}

      const currentSectionData = pages[currentPage];
      let finalResponses = { ...responses };
      if (currentSectionData && currentSectionData.id && !isReadOnly) {
          finalResponses[`__section_end_${currentSectionData.id}`] = new Date().toISOString();
      }

      const payload = {
        templateId: id,
        taskId: taskId || '',
        ownerEmail: uEmail,
        responses: finalResponses,
        metadata: { 
            ...(origMeta.receivedAt ? { receivedAt: origMeta.receivedAt } : {}),
            ...(origMeta.acceptedAt ? { acceptedAt: origMeta.acceptedAt } : {}),
            appVersion: '1.0',
            durationSeconds: Math.floor((Date.now() - startTime) / 1000),
            devicePlatform: 'AppMovel'
        },
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString()
      };

      const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
      // Salva execução offline completa
      if (taskId) {
         await AsyncStorage.setItem(`@brspark_execution_${taskId}`, JSON.stringify(payload));
      }
      
        console.log("Checklist concluído offline-first. Injetando no Outbox...");
        const outboxStr = await AsyncStorage.getItem('@brspark_outbox') || '[]';
        let outbox = [];
        try { outbox = JSON.parse(outboxStr); } catch(e){}
        if (!Array.isArray(outbox)) outbox = [];
        
        // Evita duplicar no Outbox e injeta
        outbox = outbox.filter(item => item.taskId !== taskId);
        outbox.push(payload);
        
        await AsyncStorage.setItem('@brspark_outbox', JSON.stringify(outbox));
        await AsyncStorage.removeItem(draftKey);
        
        // Aciona explicitamente o Sync Worker em background se possível
        try {
            const { pushSyncQueue } = require('../../src/services/syncService');
            pushSyncQueue(uEmail);
        } catch(e) {}

        // Volta ao estado IDLE e dispara cálculo de métricas da OS
        dataCollectionService.setState('IDLE', {
          executionId: String(taskId || ''),
          ownerEmail: uEmail,
        }).catch(() => {});
        // Métricas calculadas em background — não bloqueia navegação
        apiFetch(`/api/metrics/calculate/${taskId}`, { method: 'POST' }).catch(() => {});

        router.back();
    } catch (err) {
       Alert.alert("Erro Central", "Não foi possível arquivar a execução.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Logic Engine Evaluator (IF/THEN Rules Central) ---
  const evaluateCondition = (condFieldId: string, op: string, condValue: any, dataModel: any = responses) => {
      const rawDepVal = dataModel[condFieldId];
      const parseToStr = (val: any) => {
         if (val === undefined || val === null) return '';
         if (Array.isArray(val)) return val.join(', ').toLowerCase();
         return String(val).toLowerCase();
      };
      
      const depVal = parseToStr(rawDepVal).trim();
      const targetVal = parseToStr(condValue).trim();

      if (op === 'is_empty') return depVal === '';
      if (op === 'not_empty') return depVal !== '';

      if (op === '==') return depVal === targetVal;
      if (op === '!=') return depVal !== targetVal;
      if (op === 'contains') return depVal.includes(targetVal);
      if (op === 'not_contains') return !depVal.includes(targetVal);

      const numDep = parseFloat(depVal);
      const numTarget = parseFloat(targetVal);
      
      if (isNaN(numDep) || isNaN(numTarget)) return false; 
      
      if (op === '>') return numDep > numTarget;
      if (op === '<') return numDep < numTarget;
      if (op === '>=') return numDep >= numTarget;
      if (op === '<=') return numDep <= numTarget;
      
      return false;
  };

  // --- Central Automations (Side Effects Engine) ---
  const getAllRules = () => {
     const globalRules = template?.settings?.rules || [];
     let fieldRules: any[] = [];
     if (template?.schemaData) {
         template.schemaData.forEach((f: any) => {
             if (f.rules && f.rules.length > 0) {
                 f.rules.forEach((r: any) => {
                     fieldRules.push({
                         ...r,
                         condFieldId: f.id,
                         condOperator: r.operator || r.condOperator,
                         condValue: r.value || r.condValue
                     });
                 });
             }
         });
     }
     return [...globalRules, ...fieldRules];
  };

  const handleApiValidation = async (fieldId: string) => {
      const rules = getAllRules();
      // Encontra regras engatilhadas por este campo que são do tipo API_VALIDATION e cuja condição é verdadeira
      const triggeredRules = rules.filter((r: any) => 
          r.condFieldId === fieldId && 
          evaluateCondition(r.condFieldId, r.condOperator, r.condValue, responses) &&
          r.actions && 
          r.actions.some((a:any) => a.type === 'API_VALIDATION')
      );

      if (triggeredRules.length === 0) return;

      for (const rule of triggeredRules) {
          const apiActions = rule.actions.filter((a:any) => a.type === 'API_VALIDATION');
          for (const action of apiActions) {
              setValidatingFieldId(fieldId);
              try {
                  const netState = await Network.getNetworkStateAsync();
                  // Se marcado para ignorar offline e o app estiver offline, passa direto
                  if (action.apiAllowOffline && !netState.isConnected) {
                     continue;
                  }
                  
                  const apiRes = await fetch(action.apiUrl, {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({ checklist_id: template?.id, task_id: taskId, responses }) // Payload completo com contexto
                  });
                  const text = await apiRes.text();
                  
                  // Sucesso se o regex ou a string bater na resposta do servidor
                  const expected = action.apiExpectedReturn || '';
                  if (expected && !text.includes(expected) && !new RegExp(expected).test(text)) {
                      throw new Error(action.apiErrorMsg || 'Consulta bloqueada. Verifique os dados e a conexão com a API Externa.');
                  }
              } catch (err: any) {
                  Alert.alert('Bloqueio no Sistema Externo', err.message);
                  // Limpa o valor para impedir o técnico de avançar com o dado inválido
                  handleInput(fieldId, '');
              } finally {
                  setValidatingFieldId(null);
              }
          }
      }
  };

  useEffect(() => {
     const rules = getAllRules();
     if (rules.length === 0) return;
     if (Object.keys(responses).length === 0) return; // Prevent firing on absolute empty baseline
     
     let hasChanges = false;
     let nextResponses = { ...responses };

     rules.forEach((rule: any) => {
        if (evaluateCondition(rule.condFieldId, rule.condOperator, rule.condValue, nextResponses)) {
            rule.actions?.forEach((action: any) => {
               if (action.type === 'SET_VALUE' && action.targetId) {
                  const currentVal = nextResponses[action.targetId];
                  const targetVal = action.value || '';
                  if (currentVal !== targetVal) {
                     nextResponses[action.targetId] = targetVal;
                     hasChanges = true;
                  }
               }
            });
        }
     });

     if (hasChanges) {
        setResponses(nextResponses);
        const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
        AsyncStorage.setItem(draftKey, JSON.stringify(nextResponses));
     }
  }, [responses, template]);

  const isFieldVisible = (field: any, checkSectionBreak = false) => {
      if (field.type === 'section_break' && !checkSectionBreak) return false; 
      if (field.type === 'hidden') return false;
      
      const rules = getAllRules();
      
      const showRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'SHOW' && a.targetId === field.id));
      const hideRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'HIDE' && a.targetId === field.id));
      
      // Legacy support for fields built before the Rules Central
      if (field.dependsOnId) {
          if (!evaluateCondition(field.dependsOnId, field.dependsOnOperator || '==', field.dependsOnValue)) return false;
      }
      
      // SHOW Rule Pipeline
      if (showRules.length > 0) {
          const anyShowTrue = showRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (!anyShowTrue) return false;
      }
      
      // HIDE Rule Pipeline
      if (hideRules.length > 0) {
          const anyHideTrue = hideRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (anyHideTrue) return false; // Hide it!
      }

      return true;
  };

  const isFieldRequired = (field: any) => {
      let isReq = field.required;
      const rules = getAllRules();
      
      const requireRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'REQUIRE' && a.targetId === field.id));
      if (requireRules.length > 0) {
          const anyReqTrue = requireRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (anyReqTrue) isReq = true;
      }
      
      const optionalRules = rules.filter((r: any) => r.actions && r.actions.some((a: any) => a.type === 'OPTIONAL' && a.targetId === field.id));
      if (optionalRules.length > 0) {
          const anyOptTrue = optionalRules.some((r: any) => evaluateCondition(r.condFieldId, r.condOperator, r.condValue));
          if (anyOptTrue) isReq = false;
      }
      
      return isReq;
  };

  // --- Paginator Chunking Engine ---
  const schema = template?.schemaData || [];
  let rawPages: { fields: any[], pageTitle: string, id: string, isVisible: boolean }[] = [];
  let _curFields: any[] = [];
  let _globalIndex = 1;
  let _currentSectionTitle = 'Página 1';
  let _currentSectionId = 'page_1';
  let _currentSectionVisible = true;

  schema.forEach((f: any) => {
     if (f.type === 'section_break') {
         if (_curFields.length > 0 || rawPages.length > 0) {
             rawPages.push({ fields: _curFields, pageTitle: _currentSectionTitle, id: _currentSectionId, isVisible: _currentSectionVisible });
         }
         _curFields = [];
         _currentSectionTitle = f.label || `Página ${rawPages.length + 1}`;
         _currentSectionId = f.id;
         _currentSectionVisible = isFieldVisible(f, true);
     } else {
         _curFields.push({ ...f, _globalIdx: _globalIndex++ });
     }
  });
  if (_curFields.length > 0 || rawPages.length === 0) {
      rawPages.push({ fields: _curFields, pageTitle: _currentSectionTitle, id: _currentSectionId, isVisible: _currentSectionVisible });
  }

  const pages = rawPages.filter(p => p.isVisible);

  // Focus Section Tracking
  useEffect(() => {
     const currentSectionData = pages[currentPage];
     if (currentSectionData && currentSectionData.id && !isReadOnly && Object.keys(responses).length > 0) {
        const startKey = `__section_start_${currentSectionData.id}`;
        if (!responses[startKey]) {
            setResponses((prev: any) => {
                if(prev[startKey]) return prev;
                const newRes = { ...prev, [startKey]: new Date().toISOString() };
                const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
                AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
                return newRes;
            });
        }
     }
  }, [currentPage, isReadOnly, pages, responses]);

  const handleNextPage = () => {
     const currentPageData = pages[currentPage];
     let isValid = true;
     for (const f of currentPageData.fields) {
         if (!isFieldVisible(f)) continue;
         if (isFieldRequired(f)) {
             const ans = responses[f.id];
             if (ans === undefined || ans === null || String(ans).trim() === '') {
                 isValid = false;
                 Alert.alert('Atenção', `O campo '${f.label}' é obrigatório.`);
                 break; // Pare no primeiro erro
             }
         }
     }

     if (isValid && currentPage < pages.length - 1) {
         if (currentPageData && currentPageData.id && !isReadOnly) {
            const endKey = `__section_end_${currentPageData.id}`;
            const newRes = { ...responses, [endKey]: new Date().toISOString() };
            setResponses(newRes);
            const draftKey = taskId ? `@draft_tsk_${taskId}` : `@draft_chk_${id}`;
            AsyncStorage.setItem(draftKey, JSON.stringify(newRes));
         }
         setCurrentPage(p => p + 1);
     }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  // ── Opção B: Tela de Mapa de Confirmação ───────────────────────
  if (showGeoMap && currentTask) {
    return (
      <GeofenceMapScreen
        task={currentTask}
        failMode={geofenceFailMode}
        onCancel={() => router.back()}
        onProceed={async () => {
          setShowGeoMap(false);
          setGeoMapChecked(true);
          // Start route tracking if it's a route (Opção D)
          if (currentTask?.locationZoneType === 'route' && currentTask?.locationPolygon) {
            const poly = typeof currentTask.locationPolygon === 'string'
              ? JSON.parse(currentTask.locationPolygon)
              : currentTask.locationPolygon;
            const tolerance = currentTask.locationRadius || 100; // metros configuráveis
            routeTracker.start(poly, tolerance).catch(() => {});
          }
        }}
      />
    );
  }

  const currentPageData = pages[currentPage] || { fields: [], pageTitle: 'Checklist' };
  const currentFieldsToRender = currentPageData.fields;

  return (
    <View style={styles.container}>
      <LinearGradient 
        colors={['#EA580C', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#FFF"/></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{currentPageData.pageTitle !== 'Página 1' ? currentPageData.pageTitle : (template?.title || 'Checklist')}</Text>
        <View style={{width: 24}}/>
      </LinearGradient>
      
      {/* Opção A: Status bar em tempo real */}
      <GeofenceStatusBar task={currentTask} />

      {/* Opção D: Barra de progresso de rota (visível só para rotas ativas) */}
      <RouteProgressBar />

      {/* Mapa ao vivo durante deslocamento de rota/ponto */}
      {(() => {
        const schema = template?.schemaData || [];
        const hasTransit = schema.some((f: any) => f.type === 'transit_start');
        if (!hasTransit && currentTask?.locationZoneType !== 'route' && currentTask?.locationZoneType !== 'segment') return null;

        const rawPoly = currentTask?.locationPolygon;
        let routeCoords: number[][] = [];
        if ((currentTask?.locationZoneType === 'route' || currentTask?.locationZoneType === 'segment') && rawPoly) {
            let parsed = typeof rawPoly === 'string' ? null : rawPoly;
            if (!parsed) {
                try { parsed = JSON.parse(rawPoly as string); } catch {}
            }
            if (Array.isArray(parsed)) {
                routeCoords = parsed.map((pt: any) => {
                    if (Array.isArray(pt)) return [parseFloat(pt[0]), parseFloat(pt[1])];
                    return pt.lat !== undefined ? [parseFloat(pt.lat), parseFloat(pt.lng)] : pt;
                });
            }
        }
          
        const endField = schema.find((f: any) => f.type === 'transit_end');
        const startField = schema.find((f: any) => f.type === 'transit_start');
        
        let isTransitFinished = false;
        if (endField && responses[endField.id]) isTransitFinished = true;
        
        let isTransitStarted = false;
        if (startField && responses[startField.id]) isTransitStarted = true;
        
        const isVisible = showLiveMap || (isTransitStarted && !isTransitFinished);

        return <LiveRouteMapCard 
                  route={routeCoords} 
                  visible={isVisible}
                  zoneType={currentTask?.locationZoneType}
                  targetLoc={{ lat: currentTask?.locationLat, lng: currentTask?.locationLng }}
                  etaMinutes={currentTask?.etaMinutes}
                  taskId={typeof taskId === 'string' ? taskId : undefined}
                  onEndTransit={endField ? () => {
                      const hasValue = !!responses[endField.id];
                      if (!hasValue) {
                          // Retrieve final traversed path from tracker
                          const path = routeTracker.getTraversedPath();
                          handleTransit(endField.id, 'CHEGADA', path);
                          setShowLiveMap(false);
                      }
                  } : undefined}
               />;
      })()}

      {pages.length > 1 && (
         <View style={styles.progressBarWrapper}>
            <View style={[styles.progressBarFill, { width: `${((currentPage + 1) / pages.length) * 100}%` }]} />
            <Text style={styles.progressText}>Página {currentPage + 1} de {pages.length}</Text>
         </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {isReadOnly && (
            <View style={{backgroundColor: '#EFF6FF', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                <Ionicons name="information-circle" size={24} color="#3B82F6" style={{marginRight: 8}}/>
                <Text style={{flex: 1, color: '#1E3A8A', fontWeight: '600', fontSize: 13}}>Esta OS já foi concluída e os campos estão bloqueados para alteração.</Text>
            </View>
        )}
        <View pointerEvents={isReadOnly ? "none" : "auto"} style={{ gap: 16 }}>
        {currentFieldsToRender.length === 0 && (
            <Text style={{textAlign: 'center', color: '#64748b', marginVertical: 32}}>Nenhum campo nesta etapa.</Text>
        )}
        {currentFieldsToRender.map((field: any) => {
          if (!isFieldVisible(field)) return null;

          const renderFieldIcon = (f: any) => {
            const lib = f.iconLibrary || 'Ionicons';
            const name = f.icon as any;
            const color = f.iconColor || "#0F172A";
            const size = 24;
            switch(lib) {
               case 'AntDesign': return <AntDesign name={name} size={size} color={color} />;
               case 'Entypo': return <Entypo name={name} size={size} color={color} />;
               case 'Feather': return <Feather name={name} size={size} color={color} />;
               case 'FontAwesome': return <FontAwesome name={name} size={size} color={color} />;
               case 'FontAwesome5': return <FontAwesome5 name={name} size={size} color={color} />;
               case 'Foundation': return <Foundation name={name} size={size} color={color} />;
               case 'MaterialIcons': return <MaterialIcons name={name} size={size} color={color} />;
               case 'MaterialCommunityIcons': return <MaterialCommunityIcons name={name} size={size} color={color} />;
               case 'Octicons': return <Octicons name={name} size={size} color={color} />;
               case 'Ionicons':
               default:
                  return <Ionicons name={name} size={size} color={color} />;
            }
          };

          return (
            <View key={field.id} style={[styles.card, { flexDirection: field.icon ? 'row' : 'column', alignItems: field.icon ? 'flex-start' : 'stretch' }]}>
              {field.icon && (
                 <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 2 }}>
                     {renderFieldIcon(field)}
                 </View>
              )}
              <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { marginBottom: field.description ? 6 : 12, fontSize: 15, color: '#0F172A', fontWeight: '800' }]}>
                      {field.icon ? '' : `${field._globalIdx}. `}{field.label}{isFieldRequired(field) ? <Text style={{color: '#EF4444'}}> *</Text> : null}
                  </Text>
                  {field.description ? <Text style={{fontSize: 12, color: '#64748b', marginBottom: 12}}>{field.description}</Text> : null}
                  
                  {validatingFieldId === field.id && (
                      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', padding: 8, borderRadius: 6, marginBottom: 12}}>
                          <ActivityIndicator size="small" color="#0284c7" style={{marginRight: 8}} />
                          <Text style={{color: '#0284c7', fontSize: 12, fontWeight: '700'}}>Consultando sistema remoto...</Text>
                      </View>
                  )}
              
              {(field.type === 'text' || field.type === 'email' || field.type === 'phone' || field.type === 'date') && (
                <TextInput
                  style={styles.input}
                  placeholder={field.type === 'date' ? 'DD/MM/YYYY' : 'Sua resposta...'}
                  keyboardType={field.type === 'email' ? 'email-address' : field.type === 'phone' ? 'phone-pad' : 'default'}
                  value={responses[field.id] || ''}
                  editable={validatingFieldId !== field.id}
                  onChangeText={(val) => handleInput(field.id, applyMask(val, field.textMask))}
                  onEndEditing={() => handleApiValidation(field.id)}
                />
              )}
              {field.type === 'number' && (
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  keyboardType="numeric"
                  value={responses[field.id] || ''}
                  editable={validatingFieldId !== field.id}
                  onChangeText={(val) => handleInput(field.id, applyMask(val, field.textMask))}
                  onEndEditing={() => handleApiValidation(field.id)}
                />
              )}
              {field.type === 'dropdown' && (
                <View style={{gap: 8}}>
                   {(field.options || '').split(',').map((opt:string, i:number) => {
                     const val = opt.trim();
                     if(!val) return null;
                     const active = responses[field.id] === val;
                     return (
                       <TouchableOpacity key={i} onPress={() => handleInput(field.id, val)}
                         style={{padding:14, borderRadius:8, backgroundColor: active ? colors.primary : '#f8fafc', borderWidth:1, borderColor: active ? colors.primary : '#cbd5e1'}}>
                         <Text style={{color: active ? '#FFF' : '#475569', fontWeight: active ? '800':'600'}}>{val}</Text>
                       </TouchableOpacity>
                     );
                   })}
                </View>
              )}
              {field.type === 'multiselect' && (
                <View style={{gap: 8}}>
                   {(field.options || '').split(',').map((opt:string, i:number) => {
                     const val = opt.trim();
                     if(!val) return null;
                     const currentStr = responses[field.id] || '';
                     const activeArray = currentStr.split(',').map((s:string) => s.trim()).filter((s:string) => s);
                     const isActive = activeArray.includes(val);
                     
                     const toggle = () => {
                        let newArr = [...activeArray];
                        if(isActive) newArr = newArr.filter(x => x !== val);
                        else newArr.push(val);
                        handleInput(field.id, newArr.join(', '));
                     };
                     
                     return (
                       <TouchableOpacity key={i} onPress={toggle}
                         style={{padding:14, borderRadius:8, backgroundColor: isActive ? '#f0fdf4' : '#f8fafc', borderWidth:1, borderColor: isActive ? colors.primary : '#cbd5e1', flexDirection: 'row', alignItems: 'center'}}>
                         <Ionicons name={isActive ? "checkbox" : "square-outline"} size={22} color={isActive ? colors.primary : '#94a3b8'} style={{marginRight: 10}}/>
                         <Text style={{color: isActive ? colors.primary : '#475569', fontWeight: isActive ? '800':'600'}}>{val}</Text>
                       </TouchableOpacity>
                     );
                   })}
                </View>
              )}
              {field.type === 'rating' && (
                <View style={{flexDirection:'row', gap:10, justifyContent:'center', paddingVertical:10}}>
                   {[1,2,3,4,5].map(star => (
                      <TouchableOpacity key={star} onPress={() => handleInput(field.id, star)}>
                         <Ionicons name={responses[field.id] >= star ? "star" : "star-outline"} size={42} color={responses[field.id] >= star ? "#f59e0b" : "#cbd5e1"} />
                      </TouchableOpacity>
                   ))}
                </View>
              )}
              {field.type === 'calculated' && (() => {
                 let rawFormula = field.calcFormula || '';
                 Object.keys(responses).forEach(key => {
                     let valObj = responses[key];
                     let val = parseFloat(valObj);
                     if(isNaN(val)) val = 0;
                     rawFormula = rawFormula.split(key).join(val.toString());
                 });
                 let result = 0;
                 try { result = eval(rawFormula); } catch(e){}
                 
                 if(responses[field.id] !== result) {
                     setTimeout(() => handleInput(field.id, result), 0);
                 }
                 
                 return (
                   <View style={[styles.input, {backgroundColor:'#f5f3ff', borderColor:'#c4b5fd'}]}>
                      <Text style={{color:'#7c3aed', fontFamily:'monospace', fontWeight:'bold'}}>Resultado: {result}</Text>
                   </View>
                 );
              })()}
              {(field.type === 'checkbox' || field.type === 'yes_no') && (
                <View style={styles.radioGroup}>
                   <TouchableOpacity 
                     style={[styles.radio, responses[field.id] === 'Sim' && styles.radioActive]}
                     onPress={() => handleInput(field.id, 'Sim')}
                   ><Text style={[styles.radioText, responses[field.id] === 'Sim' && {color: '#FFF'}]}>Sim</Text></TouchableOpacity>
                   <TouchableOpacity 
                     style={[styles.radio, responses[field.id] === 'Não' && styles.radioActive]}
                     onPress={() => handleInput(field.id, 'Não')}
                   ><Text style={[styles.radioText, responses[field.id] === 'Não' && {color: '#FFF'}]}>Não</Text></TouchableOpacity>
                </View>
              )}
              {(field.type === 'photo' || field.type === 'photo_stamped' || field.type === 'facial_recognition' || field.type === 'file_upload') && (
                <View>
                  {field.type === 'facial_recognition' ? (
                     <TouchableOpacity 
                         onPress={() => ensureOnlineValidation(field, () => handleMediaPicker(field.id, field.type))}
                         activeOpacity={0.8}
                         style={{
                             borderRadius: 16, overflow: 'hidden', marginVertical: 4,
                             shadowColor: "#e11d48", shadowOffset: { width: 0, height: 6 },
                             shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
                             backgroundColor: '#fff',
                             borderWidth: 1, borderColor: '#fda4af'
                         }}
                     >
                        <LinearGradient
                            colors={['#fff1f2', '#ffe4e6']}
                            start={{x:0, y:0}} end={{x:1, y:1}}
                            style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}
                        >
                            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: '#f43f5e', alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#9f1239', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset:{width:0, height:4} }}>
                                <Ionicons name="scan" size={40} color="#fff" />
                                <View style={{ position: 'absolute' }}>
                                    <Ionicons name="person" size={20} color="#fff" style={{ marginTop: 2 }} />
                                </View>
                            </View>
                            <Text style={{ fontSize: 16, fontWeight: '900', color: '#881337', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Validar Biometria
                            </Text>
                            <Text style={{ fontSize: 13, color: '#be123c', fontWeight: '500', marginTop: 4, textAlign: 'center' }}>
                                Toque para escanear a face do operador e autenticar esta operação.
                            </Text>
                        </LinearGradient>
                     </TouchableOpacity>
                  ) : (
                     <TouchableOpacity 
                        style={[styles.cameraBox]} 
                        onPress={() => ensureOnlineValidation(field, () => handleMediaPicker(field.id, field.type))}
                     >
                       <Ionicons name={field.type === 'file_upload' ? "document-attach" : "camera"} size={32} color={field.type === 'photo_stamped' ? "#d97706" : "#64748b"} />
                       <Text style={[styles.cameraText, field.type === 'photo_stamped' && {color: "#d97706"}]}>
                         {field.type === 'photo_stamped' ? 'FOTOGRAFAR (GPS OBRIGATÓRIO)' : field.type === 'file_upload' ? 'Anexar Arquivo...' : 'Adicionar Foto...'}
                       </Text>
                     </TouchableOpacity>
                  )}
                   {responses[field.id] && (
                    <View style={{marginTop:10, padding:10, backgroundColor:'#f8fafc', borderRadius:8, borderWidth: 1, borderColor: '#e2e8f0'}}>
                       {(field.type === 'photo' || field.type === 'photo_stamped' || field.type === 'facial_recognition') && (
                          <View style={{ width: '100%', height: 200, borderRadius: 6, overflow: 'hidden', marginBottom: 10, backgroundColor: '#cbd5e1' }}>
                             <Image source={{ uri: responses[field.id].split('?')[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          </View>
                       )}
                       <View style={{flexDirection:'row', alignItems:'center'}}>
                           <Ionicons name="checkmark-circle" size={24} color="#15803d" style={{marginRight:8}} />
                           <Text style={{color:'#15803d', flex:1, fontSize:12}} numberOfLines={1}>{responses[field.id].split('/').pop()}</Text>
                           <TouchableOpacity onPress={() => handleInput(field.id, null)}>
                               <Ionicons name="trash" size={24} color="#dc2626" />
                           </TouchableOpacity>
                       </View>
                    </View>
                  )}
                </View>
              )}
              {field.type === 'barcode_scan' && (
                <TouchableOpacity style={[styles.cameraBox, {borderColor: '#0284c7', backgroundColor: '#f0f9ff'}]} onPress={() => ensureOnlineValidation(field, () => {
                  Alert.alert("Scanner", "Iniciando Expo Barcode Scanner...");
                })}>
                  <Ionicons name="barcode" size={32} color="#0284c7" />
                  <Text style={[styles.cameraText, {color: '#0284c7'}]}>LER CÓDIGO DO EQUIPAMENTO</Text>
                </TouchableOpacity>
              )}
              {(field.type === 'transit_start' || field.type === 'transit_end') && (() => {
                 let isBlocked = false;
                 if (field.type === 'transit_end') {
                     const startField = currentFieldsToRender.find(f => f.type === 'transit_start');
                     if (startField && (!responses[startField.id] || responses[startField.id].trim() === '')) {
                         isBlocked = true;
                     }
                 }
                 
                 const hasValue = !!responses[field.id];
                 const buttonColor = hasValue ? '#10b981' : (isBlocked ? '#cbd5e1' : (field.type === 'transit_start' ? colors.primary : colors.accent));
                 const labelWhenClicked = field.type === 'transit_start' ? 'DESLOCAMENTO INICIADO' : 'DESLOCAMENTO FINALIZADO';
                 const labelWhenEmpty = field.type === 'transit_start' ? 'INICIAR DESLOCAMENTO' : 'FINALIZAR DESLOCAMENTO';
                 
                 return (
                    <TouchableOpacity style={[styles.actionBtn, {backgroundColor: buttonColor, flexDirection:'row', gap:8}]} onPress={() => {
                       if (isBlocked) {
                           Alert.alert("Atenção", "O Técnico deve primeiro 'Iniciar Deslocamento' antes de finalizá-lo.");
                           return;
                       }
                       if (hasValue) {
                           Alert.alert("Aviso", "Esta ação já foi registrada.");
                           return;
                       }
                       handleTransit(field.id, field.type === 'transit_start' ? 'SAIDA' : 'CHEGADA', field.type === 'transit_end' ? routeTracker.getTraversedPath() : undefined);
                        // GPS adaptativo: IN_TRANSIT ao sair, ARRIVED ao chegar
                        AsyncStorage.getItem('@brspark_email').then(email => {
                          if (field.type === 'transit_start') {
                            dataCollectionService.setState('IN_TRANSIT', {
                              executionId: String(taskId || ''),
                              ownerEmail: email || 'unknown',
                            }).catch(() => {});
                            // Ativa captura do tracejado para todas as OS
                            if (!routeTracker.isActive()) {
                                routeTracker.start([], 99999).catch(() => {});
                            }
                            // Ativar mapa ao vivo se for rota e inicio de deslocamento
                            if (currentTask?.locationZoneType === 'route' || currentTask?.locationZoneType === 'segment') {
                              setShowLiveMap(true);
                            }
                            // ━ Gerar link de rastreamento para o cliente ━
                            generateTrackingLink();
                          } else {
                            // transit_end — chegou ao local
                            dataCollectionService.setState('ARRIVED', {
                              executionId: String(taskId || ''),
                              ownerEmail: email || 'unknown',
                              lat: currentTask?.locationLat ? parseFloat(currentTask.locationLat) : undefined,
                              lng: currentTask?.locationLng ? parseFloat(currentTask.locationLng) : undefined,
                            }).catch(() => {});
                            setShowLiveMap(false);
                            routeTracker.stop(); // Interrompe a escuta do route tracker local
                          }
                        });
                    }}>
                       <Ionicons name={hasValue ? 'checkmark-circle' : (field.type === 'transit_start' ? 'play' : 'stop')} size={20} color="#FFF" />
                       <Text style={{color: '#FFF', fontWeight: 'bold', fontSize:15}}>{hasValue ? labelWhenClicked : labelWhenEmpty}</Text>
                    </TouchableOpacity>
                 );
              })()}
              {field.type === 'geofence_check' && (
                <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#e2e8f0', borderColor:'#cbd5e1', borderWidth:1, flexDirection:'row', gap:8}]} onPress={() => ensureOnlineValidation(field, async () => {
                   await handleTransit(field.id, 'VALIDACAO_CERCA');
                   // GPS chega na cerca eletrônica — modo IN_SERVICE
                   const resultStr = responses[field.id];
                   let insideZone = false;
                   try { insideZone = JSON.parse(resultStr || '{}').geofence?.insideZone; } catch {}
                   if (insideZone) {
                     const email = await AsyncStorage.getItem('@brspark_email');
                     dataCollectionService.setState('IN_SERVICE', {
                       executionId: String(taskId || ''),
                       ownerEmail: email || 'unknown',
                       lat: currentTask?.locationLat ? parseFloat(currentTask.locationLat) : undefined,
                       lng: currentTask?.locationLng ? parseFloat(currentTask.locationLng) : undefined,
                     }).catch(() => {});
                   }
                })}>
                   <Ionicons name="location" size={20} color={colors.primary} />
                   <Text style={{color: colors.primary, fontWeight: '700', fontSize:14}}>VALIDAR LOCALIZAÇÃO (GPS)</Text>
                </TouchableOpacity>
              )}
              {field.type === 'signature' && (
                 <TouchableOpacity 
                   onPress={() => ensureOnlineValidation(field, () => {
                       setCurrentSigField(field.id);
                       
                       // Try to retrieve previous strokes if they exist
                       const existingVal = responses[field.id];
                       if (existingVal && existingVal.startsWith('SIG_V1|')) {
                          const strokes = existingVal.replace('SIG_V1|', '').split('|').filter((s: string) => !s.startsWith('meta:') && s.trim().length > 0);
                          setCompletedStrokes(strokes);
                       } else {
                          setCompletedStrokes([]);
                       }
                       
                       currentStrokeRef.current = '';
                       setCurrentStrokeState('');
                       setSigModalVisible(true);
                   })}
                   style={{ 
                     height: responses[field.id] ? 160 : 120, 
                     borderWidth: 2, 
                     borderColor: responses[field.id] ? '#10b981' : '#cbd5e1', 
                     borderRadius: 12, 
                     borderStyle: responses[field.id] ? 'solid' : 'dashed', 
                     backgroundColor: responses[field.id] ? '#fff' : '#f8fafc', 
                     justifyContent: 'center', 
                     alignItems: 'center',
                     overflow: 'hidden'
                   }}
                 >
                   {responses[field.id] && responses[field.id].startsWith('SIG_V1|') ? (
                       <View style={{flex: 1, width: '100%', padding: 8}}>
                         <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 350 400" preserveAspectRatio="xMidYMid meet">
                           {responses[field.id].replace('SIG_V1|', '').split('|')
                             .filter((path: string) => !path.startsWith('meta:') && path.trim().length > 0)
                             .map((path: string, index: number) => (
                             <Path key={index} d={path} stroke="#0f172a" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                           ))}
                         </Svg>
                         <View style={{position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}>
                            <Ionicons name="checkmark" size={12} color="#15803d" />
                            <Text style={{color: '#15803d', fontSize: 10, fontWeight: '700', marginLeft: 4}}>Assinado</Text>
                         </View>
                       </View>
                   ) : responses[field.id] ? (
                       <>
                         <Ionicons name="checkmark-circle" size={32} color="#10b981" />
                         <Text style={{color: '#10b981', fontWeight: '700', marginTop: 8}}>Assinado Digitalmente</Text>
                       </>
                   ) : (
                       <>
                          <Ionicons name="pencil" size={32} color="#94a3b8" />
                          <Text style={{color: '#94a3b8', marginTop: 8, fontWeight: '600'}}>Toque para Desenhar Assinatura</Text>
                       </>
                   )}
                 </TouchableOpacity>
              )}
              </View>
            </View>
          );
        })}
        </View>
        
        <View style={styles.footerNav}>
           {currentPage > 0 ? (
              <TouchableOpacity style={styles.navBtnPrev} onPress={() => setCurrentPage(p => p - 1)}>
                  <Text style={styles.navBtnTextBlack}>{"< Voltar"}</Text>
              </TouchableOpacity>
           ) : <View style={{flex: 1}} />}

           {currentPage < pages.length - 1 ? (
              <TouchableOpacity style={styles.navBtnNext} onPress={handleNextPage}>
                  <Text style={styles.navBtnText}>{"Avançar >"}</Text>
              </TouchableOpacity>
           ) : !isReadOnly ? (
              <TouchableOpacity style={styles.submitBtn} onPress={submitExecution} disabled={submitting}>
                 {submitting ? <ActivityIndicator color="#FFF"/> : (
                   <View style={{flexDirection:'row', alignItems:'center', justifyContent: 'center', gap:8}}>
                     <Text style={styles.submitText}>CONCLUIR OS</Text>
                     <Ionicons name="checkmark-done" size={24} color="#FFF" />
                   </View>
                 )}
              </TouchableOpacity>
           ) : (
              <View style={{flex: 1, padding: 18, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginLeft: 6}}>
                 <Text style={{color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5}}>Fim do Relatório</Text>
              </View>
           )}
        </View>
      </ScrollView>

      {sigModalVisible && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={{flex:1, backgroundColor:'rgba(0,0,0,0.8)', justifyContent:'center', padding:20}}>
            <View style={{backgroundColor:'#FFF', borderRadius:16, overflow:'hidden', minHeight:400}}>
              <View style={{backgroundColor:colors.primary, padding:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                <Text style={{color:'#FFF', fontWeight:'bold', fontSize:16}}>Assine Abaixo</Text>
                <TouchableOpacity onPress={() => setCompletedStrokes([])}><Text style={{color:'#FFF', opacity:0.8}}>Limpar Painel</Text></TouchableOpacity>
              </View>
              <View style={{flex:1, backgroundColor:'#f8fafc'}} {...panResponder.panHandlers}>
                <Svg style={StyleSheet.absoluteFillObject}>
                  {completedStrokes.map((path, index) => (
                    <Path key={index} d={path} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {currentStrokeState ? <Path d={currentStrokeState} stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
                </Svg>
              </View>
              <View style={{flexDirection:'row', backgroundColor:'#FFF', padding:16, borderTopWidth:1, borderColor:'#e2e8f0'}}>
                <TouchableOpacity style={{flex:1, padding:16, marginRight:8, borderRadius:8, backgroundColor:'#e2e8f0', alignItems:'center'}} onPress={() => {setSigModalVisible(false);}}>
                  <Text style={{fontWeight:'700', color:'#475569'}}>CANCELAR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{flex:1, padding:16, borderRadius:8, backgroundColor:colors.primary, alignItems:'center'}} onPress={saveSignature} disabled={savingSignature}>
                  {savingSignature ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{fontWeight:'700', color:'#FFF'}}>SALVAR</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Modals removed: Tracking modal was removed (handled by backoffice) */}

      <Modal visible={showScanner} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <CameraView style={StyleSheet.absoluteFillObject} facing="front" ref={cameraRef}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    
                    {/* The massive border trick to create a dark overlay with a transparent hole 
                        In React Native, dimensions INCLUDE borders (border-box). 
                        So inner width = 280 -> outer = 2280
                        inner height = 380 -> outer = 2380
                        inner radius = 140 -> outer = 1140
                    */}
                    <View style={{
                        position: 'absolute',
                        width: 2280, height: 2380,
                        borderRadius: 1140,
                        borderWidth: 1000,
                        borderColor: 'rgba(0,0,0,0.85)',
                    }} pointerEvents="none" />

                    <Text style={{ position: 'absolute', top: 80, color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center', width: '80%', zIndex: 10 }}>
                        Posicione seu rosto dentro da marcação
                    </Text>

                    {/* The actual red geometric border */}
                    <View style={{
                        width: 280, height: 380,
                        backgroundColor: isCapturing ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                        borderRadius: 140,
                        borderWidth: 4,
                        borderColor: isCapturing ? '#f59e0b' : '#e11d48',
                        overflow: 'hidden',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1
                    }}>
                        {isCapturing && (
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 20 }}>
                                <Text style={{ color: '#f59e0b', fontWeight: 'bold' }}>Analisando Face...</Text>
                            </View>
                        )}
                    </View>
                    <View style={{ position: 'absolute', bottom: 40, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                        <View style={{ position: 'absolute', left: 20 }}>
                            <TouchableOpacity style={{ padding: 16 }} onPress={() => setShowScanner(false)} disabled={isCapturing}>
                                <Text style={{ color: isCapturing ? '#94a3b8' : '#FFF', fontSize: 16, fontWeight: '700' }}>CANCELAR</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity 
                            style={{ 
                                width: 72, height: 72, borderRadius: 36, 
                                backgroundColor: isCapturing ? '#f59e0b' : '#e11d48', 
                                justifyContent: 'center', alignItems: 'center', 
                                borderWidth: 4, borderColor: '#FFF',
                                shadowColor: isCapturing ? '#f59e0b' : '#e11d48',
                                shadowOpacity: 0.8, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }
                            }}
                            onPress={async () => {
                                if (isCapturing) return;
                                setIsCapturing(true);
                                
                                // Adicionamos um atraso visual sintético de 2 segundos.
                                // Assim você pode ver a animação acontecer perfeitamente mesmo no seu simulador!
                                await new Promise(r => setTimeout(r, 2000));

                                try {
                                    const snap = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
                                    if (snap?.base64 && scannerFieldId) {
                                        const ok = await processFacialImage(scannerFieldId, snap.base64, snap.uri);
                                        if (ok) {
                                            setShowScanner(false);
                                        }
                                    }
                                } catch (e) {
                                    Alert.alert("Aviso de Hardware", "No simulador a tela de captura falhará. Mas no celular funcionará normal! :)");
                                } finally {
                                    setIsCapturing(false);
                                }
                            }}
                        >
                            {isCapturing ? <ActivityIndicator color="#FFF" size="large" /> : <Ionicons name="camera" size={32} color="#FFF" />}
                        </TouchableOpacity>
                    </View>
                </View>
            </CameraView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width:0, height:2 },
    shadowOpacity: 0.15,
    shadowRadius: 8
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
  label: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#f8fafc' },
  radioGroup: { flexDirection: 'row', gap: 12 },
  radio: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#f1f5f9' },
  radioActive: { backgroundColor: colors.accent },
  radioText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  cameraBox: { height: 100, borderRadius: 8, borderWidth: 2, borderColor: '#cbd5e1', borderStyle: 'dashed', backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cameraText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  actionBtn: { padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  submitBtn: { backgroundColor: colors.accent, padding: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flex: 1, marginLeft: 6, shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  submitText: { color: '#FFF', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  progressBarWrapper: {
      height: 24,
      backgroundColor: '#e2e8f0',
      position: 'relative',
      overflow: 'hidden',
  },
  progressBarFill: {
      position: 'absolute',
      left: 0, top: 0, bottom: 0,
      backgroundColor: colors.primary,
      opacity: 0.3
  },
  progressText: {
      textAlign: 'center',
      lineHeight: 24,
      fontSize: 10,
      fontWeight: 'bold',
      color: '#475569',
      zIndex: 2
  },
  footerNav: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 20
  },
  navBtnPrev: {
      padding: 18,
      backgroundColor: '#FFF',
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      flex: 1,
      marginRight: 6
  },
  navBtnTextBlack: {
      fontWeight: '900',
      color: '#64748B',
      fontSize: 14,
      textTransform: 'uppercase',
      letterSpacing: 0.5
  },
  navBtnNext: {
      padding: 18,
      backgroundColor: colors.primary,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
      flex: 1,
      marginLeft: 6
  },
  navBtnText: {
      fontWeight: '900',
      color: '#FFF',
      fontSize: 15,
      textTransform: 'uppercase',
      letterSpacing: 1
  }
});
