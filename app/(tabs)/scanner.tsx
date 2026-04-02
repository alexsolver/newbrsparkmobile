import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getLocalAssets } from '../../src/database';

export default function ScannerScreen() {
    const { t } = useTranslation();
    const [permission, requestPermission] = useCameraPermissions();
   const [scanned, setScanned] = useState(false);
   const [isFocused, setIsFocused] = useState(false);
   const router = useRouter();

   useFocusEffect(
      React.useCallback(() => {
         setIsFocused(true);
         setScanned(false);
         if (!permission?.granted) {
            requestPermission();
         }
         return () => setIsFocused(false);
      }, [permission])
   );

   const handleBarcode = ({ data }: any) => {
      if (scanned) return;
      setScanned(true);
      
      const cleanData = data ? data.trim() : '';
      const localAssets = getLocalAssets();
      const assetExists = localAssets.find(a => a.id === cleanData);

      if (assetExists) {
          router.push(`/asset/${cleanData}` as any);
      } else {
          Alert.alert(t('scanner.error.title'), t('scanner.error.message'), [
             { text: t('scanner.error.continue'), onPress: () => setScanned(false) },
             { text: t('scanner.error.cancel'), style: 'cancel', onPress: () => router.push('/') }
          ]);
      }
   };

   if (!permission?.granted) {
      return (
         <View style={styles.container}>
            <View style={{alignItems: 'center', marginBottom: 24}}>
               <Ionicons name="camera" size={64} color={colors.primary} />
            </View>
            <Text style={{color: colors.primary, textAlign: 'center', marginBottom: 24, fontSize: 18, fontWeight: '800'}}>{t('scanner.title')}</Text>
            <Text style={{color: '#94a3b8', textAlign: 'center', marginBottom: 32, fontSize: 14, lineHeight: 22}}>{t('scanner.description')}</Text>
            <TouchableOpacity onPress={requestPermission} style={{backgroundColor: '#2563EB', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center'}}>
               <Text style={{color: '#ffffff', fontWeight: '700'}}>{t('scanner.enableBtn')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => router.push('/')} style={{paddingVertical: 18, marginTop: 12}}>
               <Text style={{color: colors.primary, fontWeight: '700'}}>{t('scanner.backBtn')}</Text>
            </TouchableOpacity>
         </View>
      );
   }

   return (
      <View style={{flex: 1, backgroundColor: '#000'}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', padding: 24, paddingTop: 60, zIndex: 10}}>
             <Text style={{color:'#fff', fontSize: 18, fontWeight: '800'}}>{t('scanner.hint')}</Text>
             <TouchableOpacity onPress={() => router.push('/')}>
                <Ionicons name="close-circle" size={32} color="#fff" />
             </TouchableOpacity>
          </View>
          
          {isFocused && (
             <CameraView 
               style={StyleSheet.absoluteFillObject} 
               barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
               onBarcodeScanned={scanned ? undefined : handleBarcode} 
             />
          )}

          <View style={styles.overlayHint} pointerEvents="none">
             <View style={styles.scannerAura}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
             </View>
             <View style={{flexDirection:'row', alignItems:'center', marginTop: 40}}>
                <Ionicons name="scan" size={20} color={colors.primary} />
                <Text style={{color: '#fff', fontWeight: '800', marginLeft: 8, fontSize: 15}}>{t('scanner.searching')}</Text>
             </View>
          </View>
      </View>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 32 },
   overlayHint: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 20 },
   scannerAura: { width: 260, height: 260, position: 'relative' },
   corner: { position: 'absolute', width: 40, height: 40, borderColor: colors.primary },
   topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
   topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
   bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
   bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
});
