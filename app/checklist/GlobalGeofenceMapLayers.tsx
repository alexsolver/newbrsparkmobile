/**
 * Camadas de mapa: círculo do destino + geometria (polígono, rota, trecho).
 * Usado no gate de cerca global e no mapa consultivo do formulário.
 */
import React from 'react';
import { Circle, Marker, Polygon, Polyline } from 'react-native-maps';
import { FontAwesome5 } from '@expo/vector-icons';
import { View } from 'react-native';
import type { GlobalGeofenceMeta } from './globalGeofenceCombined';
import { parsePolygonRaw } from './globalGeofenceCombined';

type Props = {
  gf: GlobalGeofenceMeta;
  /** Título no marcador do destino */
  destMarkerTitle?: string;
};

export default function GlobalGeofenceMapLayers({ gf, destMarkerTitle = 'Destino da OS' }: Props) {
  const { destination, destinationRadiusM, geometry } = gf;
  const poly = geometry ? parsePolygonRaw(geometry.locationPolygon) : [];
  const zt = String(geometry?.zoneType || '').toLowerCase();
  const geomRadius =
    geometry && Number.isFinite(Number(geometry.locationRadius)) && Number(geometry.locationRadius) > 0
      ? Number(geometry.locationRadius)
      : destinationRadiusM;

  return (
    <>
      {destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng) && (
        <>
          <Circle
            center={{ latitude: destination.lat, longitude: destination.lng }}
            radius={destinationRadiusM}
            fillColor="rgba(16, 185, 129, 0.14)"
            strokeColor="#059669"
            strokeWidth={2}
          />
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            title={destMarkerTitle}
            description={`Raio ${destinationRadiusM} m`}
            pinColor="#059669"
          />
        </>
      )}

      {geometry && zt === 'polygon' && poly.length >= 3 && (
        <Polygon
          coordinates={poly.map((c) => ({ latitude: c[0], longitude: c[1] }))}
          fillColor="rgba(59, 130, 246, 0.12)"
          strokeColor="#2563eb"
          strokeWidth={2}
        />
      )}

      {geometry && zt === 'route' && poly.length >= 2 && (
        <>
          <Polyline
            coordinates={poly.map((c) => ({ latitude: c[0], longitude: c[1] }))}
            strokeColor="#f97316"
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
          <Marker coordinate={{ latitude: poly[0][0], longitude: poly[0][1] }} title="Início (rota)" pinColor="#16a34a" />
          <Marker coordinate={{ latitude: poly[poly.length - 1][0], longitude: poly[poly.length - 1][1] }}>
            <View
              style={{
                width: 30,
                height: 30,
                backgroundColor: '#ea580c',
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: '#fff',
              }}
            >
              <FontAwesome5 name="flag-checkered" size={13} color="#fff" />
            </View>
          </Marker>
        </>
      )}

      {geometry && zt === 'segment' && poly.length >= 2 && (
        <>
          <Polyline
            coordinates={[
              { latitude: poly[0][0], longitude: poly[0][1] },
              { latitude: poly[1][0], longitude: poly[1][1] },
            ]}
            strokeColor="#64748b"
            strokeWidth={2}
            lineDashPattern={[5, 10]}
          />
          <Circle
            center={{ latitude: poly[0][0], longitude: poly[0][1] }}
            radius={geomRadius}
            fillColor="rgba(37, 99, 235, 0.1)"
            strokeColor="#2563eb"
            strokeWidth={2}
          />
          <Circle
            center={{ latitude: poly[1][0], longitude: poly[1][1] }}
            radius={geomRadius}
            fillColor="rgba(217, 70, 239, 0.1)"
            strokeColor="#d946ef"
            strokeWidth={2}
          />
          <Marker coordinate={{ latitude: poly[0][0], longitude: poly[0][1] }} title="Ponto A" pinColor="#2563eb" />
          <Marker coordinate={{ latitude: poly[1][0], longitude: poly[1][1] }} title="Ponto B" pinColor="#d946ef" />
        </>
      )}

      {geometry && zt === 'radius' && geometry.locationLat != null && geometry.locationLng != null && (
        <>
          <Circle
            center={{
              latitude: Number(geometry.locationLat),
              longitude: Number(geometry.locationLng),
            }}
            radius={geomRadius}
            fillColor="rgba(59, 130, 246, 0.1)"
            strokeColor="#3b82f6"
            strokeWidth={2}
          />
          <Marker
            coordinate={{
              latitude: Number(geometry.locationLat),
              longitude: Number(geometry.locationLng),
            }}
            title="Geometria (raio)"
            pinColor="#3b82f6"
          />
        </>
      )}
    </>
  );
}
