// Maps.web.js
import React from 'react';
import { View } from 'react-native';
import { MapContainer, TileLayer, Marker as LMarker, Popup, Polyline as LPolyline } from 'react-leaflet';
import L from 'leaflet';
import { useState, useEffect } from 'react';

// 1. Inyectamos el CSS dinámicamente para evitar errores del empaquetador de React Native Web
if (typeof window !== 'undefined' && !document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
}

// 2. Función para crear pines de colores usando un CDN gratuito
const createIcon = (color) => {
    const validColors = ['blue', 'gold', 'red', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'];
    const pinColor = validColors.includes(color) ? color : 'blue';

    return new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${pinColor}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
};

// 3. Adaptador del Componente Marker
export const Marker = ({ coordinate, title, description, pinColor }) => {
    if (!coordinate) return null;
    const position = [coordinate.latitude, coordinate.longitude];
    const icon = createIcon(pinColor);

    return (
        <LMarker position={position} icon={icon}>
            {(title || description) && (
                <Popup>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{title}</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>{description}</div>
                </Popup>
            )}
        </LMarker>
    );
};


// 4. Adaptador Inteligente del Componente Polyline (Sigue las calles reales)
export const Polyline = ({ coordinates, strokeColor, strokeWidth }) => {
    const [routePath, setRoutePath] = useState([]);

    useEffect(() => {
        if (!coordinates || coordinates.length < 2) return;

        // Convertir coordenadas al formato que exige la API de OSRM (lon,lat;lon,lat)
        const coordsString = coordinates
            .map((c) => `${c.longitude},${c.latitude}`)
            .join(';');

        // Llamada a la API pública y gratuita de enrutamiento OSRM
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

        fetch(url)
            .then((res) => res.json())
            .then((data) => {
                if (data.routes && data.routes.length > 0) {
                    // OSRM devuelve [longitud, latitud], Leaflet dibuja con [latitud, longitud]
                    const callesReales = data.routes[0].geometry.coordinates.map((coord) => [
                        coord[1],
                        coord[0],
                    ]);
                    setRoutePath(callesReales);
                } else {
                    // Si falla, dibuja líneas rectas de respaldo
                    setRoutePath(coordinates.map((c) => [c.latitude, c.longitude]));
                }
            })
            .catch((err) => {
                console.error("Error obteniendo ruta real:", err);
                setRoutePath(coordinates.map((c) => [c.latitude, c.longitude]));
            });
    }, [coordinates]);

    if (routePath.length === 0) return null;

    return (
        <LPolyline
            positions={routePath}
            pathOptions={{ color: strokeColor, weight: strokeWidth, opacity: 0.8 }}
        />
    );
};
// 5. Adaptador del Componente MapView Principal
export default function MapView({ initialRegion, children, style }) {
    // Coordenadas de Cúcuta por defecto si no llega la región inicial
    const center = initialRegion
        ? [initialRegion.latitude, initialRegion.longitude]
        : [7.8891, -72.4967];

    return (
        <View style={style}>
            <MapContainer
                center={center}
                zoom={14}
                style={{ height: '100%', width: '100%', position: 'absolute' }}
                zoomControl={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {children}
            </MapContainer>
        </View>
    );
}