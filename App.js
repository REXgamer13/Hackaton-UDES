import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  SafeAreaView,
  StatusBar,
  TextInput,
} from 'react-native';
import MapView, { Marker, Polyline } from './Maps';

// ==========================================
// 1. CONFIGURACIÓN INICIAL (CÚCUTA)
// ==========================================
const SEDE_ASOCIACION = {
  nombre: 'Sede Asociación Recicla Cúcuta (Centro)',
  latitude: 7.8891,
  longitude: -72.4967,
};

const FLOTA_INICIAL = [
  {
    id: 'r1',
    nombre: 'Carlos Pérez',
    telefono: '573001112233',
    categoria: 'PEATONAL',
    travelMode: 'walking',
    etiqueta: '🚶 A pie (Carretilla)',
    capacidadMaxKg: 70,
    radioMaxKm: 2.2,
    colorRuta: '#16A34A',
    activo: true,
  },
  {
    id: 'r2',
    nombre: 'Marta Gómez',
    telefono: '573002223344',
    categoria: 'PEATONAL',
    travelMode: 'walking',
    etiqueta: '🚶 A pie (Costal)',
    capacidadMaxKg: 40,
    radioMaxKm: 1.5,
    colorRuta: '#9333EA',
    activo: true,
  },
  {
    id: 'r3',
    nombre: 'Jorge Díaz (Motocarguero)',
    telefono: '573104445566',
    categoria: 'MOTORIZADO',
    travelMode: 'driving',
    etiqueta: '🛺 Motocarguero',
    capacidadMaxKg: 300,
    radioMaxKm: 8.0,
    colorRuta: '#0284C7',
    activo: true,
  },
];

const REPORTES_INICIALES = [
  {
    id: 'p1',
    remitente: 'Familia Rodríguez (Caobos)',
    material: 'Cartón y PET',
    pesoKg: 18,
    latitude: 7.8845,
    longitude: -72.4935,
    direccion: 'Calle 16 #1E-24, Caobos',
    zonaBarrio: 'Caobos',
    estado: 'PENDIENTE',
  },
  {
    id: 'p2',
    remitente: 'Panadería El Trigo',
    material: 'Cartón limpio',
    pesoKg: 15,
    latitude: 7.8878,
    longitude: -72.4988,
    direccion: 'Calle 12 #4-40, La Playa',
    zonaBarrio: 'La Playa',
    estado: 'PENDIENTE',
  },
  {
    id: 'p3',
    remitente: 'Supermercado Guaimaral',
    material: 'Estibas, Cajas y Plástico',
    pesoKg: 210,
    latitude: 7.9062,
    longitude: -72.4861,
    direccion: 'Av. Guaimaral #8N-30',
    zonaBarrio: 'Guaimaral',
    estado: 'PENDIENTE',
  },
];

// ==========================================
// 2. MOTOR MATEMÁTICO: BARRIDO POLAR + VRP
// ==========================================
const calcularDistanciaKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calcularAnguloPolar = (origen, punto) => {
  return Math.atan2(
    punto.latitude - origen.latitude,
    punto.longitude - origen.longitude
  );
};

const secuenciarParadasTSP = (origen, paradasAsignadas, recolector) => {
  const disponibles = [...paradasAsignadas];
  const rutaOrdenada = [];
  let actual = origen;
  let distanciaTotalKm = 0;
  let cargaTotalKg = 0;

  while (disponibles.length > 0) {
    let mejorIdx = 0;
    let menorDist = Infinity;

    for (let i = 0; i < disponibles.length; i++) {
      const d = calcularDistanciaKm(
        actual.latitude,
        actual.longitude,
        disponibles[i].latitude,
        disponibles[i].longitude
      );
      if (d < menorDist) {
        menorDist = d;
        mejorIdx = i;
      }
    }

    const elegido = disponibles[mejorIdx];
    distanciaTotalKm += menorDist;
    cargaTotalKg += elegido.pesoKg;
    rutaOrdenada.push({
      ...elegido,
      distanciaTramoKm: menorDist.toFixed(2),
    });
    actual = elegido;
    disponibles.splice(mejorIdx, 1);
  }

  const velocidadKmh = recolector.travelMode === 'walking' ? 4 : 24;
  const tiempoEstimadoMin = Math.round(
    (distanciaTotalKm / velocidadKmh) * 60 + rutaOrdenada.length * 5
  );

  return {
    id: `plan_${recolector.id}_${Date.now()}`,
    recolector,
    paradas: rutaOrdenada,
    cargaTotalKg,
    distanciaTotalKm: Number(distanciaTotalKm.toFixed(2)),
    tiempoEstimadoMin,
    zonasCubiertas: [...new Set(rutaOrdenada.map((p) => p.zonaBarrio))].join(
      ', '
    ),
  };
};

const distribuirFlotaPorZonas = (origen, reportesPendientes, flotaActiva) => {
  const peatonales = flotaActiva
    .filter((r) => r.categoria === 'PEATONAL')
    .sort((a, b) => a.capacidadMaxKg - b.capacidadMaxKg);

  const motorizados = flotaActiva
    .filter((r) => r.categoria === 'MOTORIZADO')
    .sort((a, b) => a.capacidadMaxKg - b.capacidadMaxKg);

  const puntosEnriquecidos = reportesPendientes.map((p) => ({
    ...p,
    distanciaSedeKm: calcularDistanciaKm(
      origen.latitude,
      origen.longitude,
      p.latitude,
      p.longitude
    ),
    angulo: calcularAnguloPolar(origen, p),
  }));

  const maxRadioPeatonal =
    peatonales.length > 0
      ? Math.max(...peatonales.map((r) => r.radioMaxKm))
      : 0;
  const maxPesoUnitarioPeatonal = 45;

  let bolsaPeatonal = [];
  let bolsaMotorizada = [];

  puntosEnriquecidos.forEach((p) => {
    if (
      peatonales.length > 0 &&
      p.distanciaSedeKm <= maxRadioPeatonal &&
      p.pesoKg <= maxPesoUnitarioPeatonal
    ) {
      bolsaPeatonal.push(p);
    } else {
      bolsaMotorizada.push(p);
    }
  });

  bolsaPeatonal.sort((a, b) => a.angulo - b.angulo);
  bolsaMotorizada.sort((a, b) => a.angulo - b.angulo);

  const planesGenerados = [];

  if (peatonales.length > 0 && bolsaPeatonal.length > 0) {
    const puntosRestantesPeaton = [...bolsaPeatonal];

    peatonales.forEach((recolector, idx) => {
      const paradasRecolector = [];
      let pesoAcumulado = 0;
      const recolectoresRestantes = peatonales.length - idx;
      const metaPuntosSector = Math.ceil(
        puntosRestantesPeaton.length / recolectoresRestantes
      );

      for (let i = 0; i < puntosRestantesPeaton.length;) {
        const candidato = puntosRestantesPeaton[i];
        const cabeEnCapacidad =
          pesoAcumulado + candidato.pesoKg <= recolector.capacidadMaxKg;
        const dentroDeRadio = candidato.distanciaSedeKm <= recolector.radioMaxKm;

        if (
          cabeEnCapacidad &&
          dentroDeRadio &&
          paradasRecolector.length < metaPuntosSector &&
          paradasRecolector.length < 8
        ) {
          paradasRecolector.push(candidato);
          pesoAcumulado += candidato.pesoKg;
          puntosRestantesPeaton.splice(i, 1);
        } else {
          i++;
        }
      }

      if (paradasRecolector.length > 0) {
        planesGenerados.push(
          secuenciarParadasTSP(origen, paradasRecolector, recolector)
        );
      }
    });

    if (puntosRestantesPeaton.length > 0) {
      bolsaMotorizada = [...bolsaMotorizada, ...puntosRestantesPeaton].sort(
        (a, b) => a.angulo - b.angulo
      );
    }
  }

  if (motorizados.length > 0 && bolsaMotorizada.length > 0) {
    const puntosRestantesMotor = [...bolsaMotorizada];

    motorizados.forEach((vehiculo, idx) => {
      const paradasVehiculo = [];
      let pesoAcumulado = 0;
      const vehiculosRestantes = motorizados.length - idx;
      const metaPuntosSector = Math.ceil(
        puntosRestantesMotor.length / vehiculosRestantes
      );

      for (let i = 0; i < puntosRestantesMotor.length;) {
        const candidato = puntosRestantesMotor[i];
        const cabeEnCapacidad =
          pesoAcumulado + candidato.pesoKg <= vehiculo.capacidadMaxKg;
        const dentroDeRadio = candidato.distanciaSedeKm <= vehiculo.radioMaxKm;

        if (
          cabeEnCapacidad &&
          dentroDeRadio &&
          paradasVehiculo.length < metaPuntosSector &&
          paradasVehiculo.length < 8
        ) {
          paradasVehiculo.push(candidato);
          pesoAcumulado += candidato.pesoKg;
          puntosRestantesMotor.splice(i, 1);
        } else {
          i++;
        }
      }

      if (paradasVehiculo.length > 0) {
        planesGenerados.push(
          secuenciarParadasTSP(origen, paradasVehiculo, vehiculo)
        );
      }
    });
  }

  return planesGenerados;
};

// ==========================================
// 3. COMPONENTE PRINCIPAL
// ==========================================
export default function App() {
  const [tabActiva, setTabActiva] = useState('MAPA');
  const [reportes, setReportes] = useState(REPORTES_INICIALES);
  const [flota, setFlota] = useState(FLOTA_INICIAL);
  const [planesZonificados, setPlanesZonificados] = useState([]);

  // Estados del formulario para agregar nuevo recolector
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoCapacidad, setNuevoCapacidad] = useState('');
  const [esVehiculo, setEsVehiculo] = useState(false);

  const [metricas, setMetricas] = useState({
    kilosRecuperados: 520,
    kmAhorrados: 29.5,
    horasSolEvitadas: 9.2,
    litrosGasolinaAhorrados: 6.8,
  });

  const toggleRecolectorActivo = (id) => {
    setFlota((prev) =>
      prev.map((r) => (r.id === id ? { ...r, activo: !r.activo } : r))
    );
    setPlanesZonificados([]);
  };

  const agregarNuevoRecolector = () => {
    if (!nuevoNombre || !nuevoTelefono || !nuevoCapacidad) {
      alert('Por favor completa todos los campos para agregar al recolector.');
      return;
    }

    const colorAleatorio = '#' + Math.floor(Math.random() * 16777215).toString(16);

    const nuevoRec = {
      id: 'r_' + Date.now(),
      nombre: nuevoNombre,
      telefono: nuevoTelefono,
      categoria: esVehiculo ? 'MOTORIZADO' : 'PEATONAL',
      travelMode: esVehiculo ? 'driving' : 'walking',
      etiqueta: esVehiculo ? '🛺 Vehículo / Motorizado' : '🚶 A pie',
      capacidadMaxKg: Number(nuevoCapacidad),
      radioMaxKm: esVehiculo ? 10.0 : 2.0,
      colorRuta: colorAleatorio,
      activo: true,
    };

    setFlota((prev) => [...prev, nuevoRec]);
    setNuevoNombre('');
    setNuevoTelefono('');
    setNuevoCapacidad('');
    setEsVehiculo(false);
    alert(`¡Recolector ${nuevoNombre} agregado con éxito a la flota!`);
  };

  const handleDistribuirFlota = () => {
    const pendientes = reportes.filter((r) => r.estado === 'PENDIENTE');
    const activos = flota.filter((r) => r.activo);

    if (pendientes.length === 0) {
      alert('No hay residuos pendientes en el mapa.');
      return;
    }
    if (activos.length === 0) {
      alert('Activa al menos un recolector en la pestaña Flota.');
      return;
    }

    const planes = distribuirFlotaPorZonas(
      SEDE_ASOCIACION,
      pendientes,
      activos
    );
    setPlanesZonificados(planes);
  };

  const despacharRutaWhatsApp = (plan) => {
    const {
      recolector,
      paradas,
      cargaTotalKg,
      distanciaTotalKm,
      tiempoEstimadoMin,
      zonasCubiertas,
    } = plan;

    const origenStr = `${SEDE_ASOCIACION.latitude},${SEDE_ASOCIACION.longitude}`;
    const ultima = paradas[paradas.length - 1];
    const destinoStr = `${ultima.latitude},${ultima.longitude}`;

    const intermedias = paradas
      .slice(0, -1)
      .map((p) => `${p.latitude},${p.longitude}`)
      .join('%7C');

    const waypointsParam = intermedias ? `&waypoints=${intermedias}` : '';
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origenStr}&destination=${destinoStr}${waypointsParam}&travelmode=${recolector.travelMode}`;

    const listaParadas = paradas
      .map(
        (p, i) =>
          `${i + 1}. *${p.remitente}* (${p.direccion})\n   📦 ${p.pesoKg} kg - ${p.material}`
      )
      .join('\n\n');

    const mensaje =
      `♻️ *HOJA DE RUTA ZONIFICADA - CÚCUTA*\n` +
      `👷 *Asociado:* ${recolector.nombre}\n` +
      `🚦 *Transporte:* ${recolector.etiqueta}\n` +
      `📍 *Zona asignada:* ${zonasCubiertas}\n` +
      `⚖️ *Carga total:* ${cargaTotalKg} / ${recolector.capacidadMaxKg} kg\n` +
      `📏 *Recorrido:* ${distanciaTotalKm} km (~${tiempoEstimadoMin} min)\n\n` +
      `📋 *PARADAS EN ORDEN ÓPTIMO:*\n${listaParadas}\n\n` +
      `🗺️ *Abrir navegación en Google Maps:*\n${googleMapsUrl}`;

    const idsAsignados = paradas.map((p) => p.id);
    setReportes((prev) => prev.filter((r) => !idsAsignados.includes(r.id)));
    setPlanesZonificados((prev) => prev.filter((pl) => pl.id !== plan.id));

    setMetricas((prev) => ({
      ...prev,
      kilosRecuperados: prev.kilosRecuperados + cargaTotalKg,
      kmAhorrados: Number((prev.kmAhorrados + distanciaTotalKm * 0.4).toFixed(1)),
      horasSolEvitadas:
        recolector.categoria === 'PEATONAL'
          ? Number((prev.horasSolEvitadas + 0.8).toFixed(1))
          : prev.horasSolEvitadas,
      litrosGasolinaAhorrados:
        recolector.categoria === 'MOTORIZADO'
          ? Number(
            (prev.litrosGasolinaAhorrados + distanciaTotalKm * 0.12).toFixed(2)
          )
          : prev.litrosGasolinaAhorrados,
    }));

    const url = `https://wa.me/${recolector.telefono}?text=${encodeURIComponent(
      mensaje
    )}`;
    Linking.openURL(url).catch(() =>
      alert('No se pudo abrir WhatsApp.')
    );
  };

  const simularReporteWhatsApp = () => {
    const nuevo = {
      id: 'w_' + Date.now(),
      remitente: 'Restaurante La Brasa (El Malecón)',
      material: 'Vidrio, Latas y Cartón',
      pesoKg: 45,
      latitude: 7.8965,
      longitude: -72.4842,
      direccion: 'Av. Libertadores #15-10',
      zonaBarrio: 'El Malecón',
      estado: 'PENDIENTE',
    };
    setReportes((prev) => [...prev, nuevo]);
    setPlanesZonificados([]);
    alert(`📲 ¡Nuevo reporte WA recibido!\nRestaurante La Brasa reportó ${nuevo.pesoKg} kg en ${nuevo.zonaBarrio}. Pin agregado al mapa.`);
  };

  const peatonalesActivos = flota.filter(
    (r) => r.activo && r.categoria === 'PEATONAL'
  ).length;
  const motorizadosActivos = flota.filter(
    (r) => r.activo && r.categoria === 'MOTORIZADO'
  ).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>EcoRuta Cúcuta • Flota y Zonas</Text>
          <Text style={styles.headerSubtitle}>
            Activos hoy: {peatonalesActivos} a pie • {motorizadosActivos}{' '}
            vehículos
          </Text>
        </View>
        <TouchableOpacity
          style={styles.simularBtn}
          onPress={simularReporteWhatsApp}
        >
          <Text style={styles.simularBtnText}>+ Reporte WA</Text>
        </TouchableOpacity>
      </View>

      {/* PESTAÑA 1: MAPA */}
      {tabActiva === 'MAPA' && (
        <View style={styles.contentContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: SEDE_ASOCIACION.latitude,
              longitude: SEDE_ASOCIACION.longitude,
              latitudeDelta: 0.045,
              longitudeDelta: 0.045,
            }}
          >
            <Marker
              coordinate={SEDE_ASOCIACION}
              title={SEDE_ASOCIACION.nombre}
              description="Centro de Acopio"
              pinColor="blue"
            />

            {reportes.map((rep) => (
              <Marker
                key={rep.id}
                coordinate={{
                  latitude: rep.latitude,
                  longitude: rep.longitude,
                }}
                title={`${rep.remitente} (${rep.pesoKg} kg)`}
                description={`Zona: ${rep.zonaBarrio} • ${rep.material}`}
                pinColor={rep.pesoKg > 45 ? 'red' : 'green'}
              />
            ))}

            {planesZonificados.map((plan) => (
              <Polyline
                key={plan.id}
                coordinates={[
                  SEDE_ASOCIACION,
                  ...plan.paradas.map((p) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                  })),
                ]}
                strokeColor={plan.recolector.colorRuta}
                strokeWidth={4}
              />
            ))}
          </MapView>

          <View style={styles.bottomSheet}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleDistribuirFlota}
            >
              <Text style={styles.primaryBtnText}>
                ⚡ Distribuir {reportes.length} Puntos en Flota Activa (
                {peatonalesActivos} 🚶 + {motorizadosActivos} 🚚)
              </Text>
            </TouchableOpacity>

            {planesZonificados.length > 0 && (
              <ScrollView
                style={styles.plansScroll}
                showsVerticalScrollIndicator={false}
              >
                {planesZonificados.map((plan) => (
                  <View
                    key={plan.id}
                    style={[
                      styles.planCard,
                      { borderLeftColor: plan.recolector.colorRuta },
                    ]}
                  >
                    <View style={styles.planHeader}>
                      <Text style={styles.planWorkerName}>
                        {plan.recolector.nombre} ({plan.recolector.etiqueta})
                      </Text>
                      <Text style={styles.planWeightBadge}>
                        {plan.cargaTotalKg}/{plan.recolector.capacidadMaxKg} kg
                      </Text>
                    </View>

                    <Text style={styles.planZoneText}>
                      📍 Sector: {plan.zonasCubiertas} •{' '}
                      {plan.distanciaTotalKm} km (~{plan.tiempoEstimadoMin} min)
                    </Text>

                    {plan.paradas.map((p, i) => (
                      <Text key={p.id} style={styles.stopLine}>
                        {i + 1}. {p.remitente} ({p.pesoKg}kg)
                      </Text>
                    ))}

                    <TouchableOpacity
                      style={styles.waDispatchBtn}
                      onPress={() => despacharRutaWhatsApp(plan)}
                    >
                      <Text style={styles.waDispatchText}>
                        📲 Enviar a {plan.recolector.nombre} por WhatsApp
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}

      {/* PESTAÑA 2: GESTIÓN Y CREACIÓN DE FLOTA */}
      {tabActiva === 'FLOTA' && (
        <ScrollView style={styles.tabContent}>
          <Text style={styles.pageTitle}>Gestión de Flota y Asociados</Text>
          <Text style={styles.helperText}>
            Registra nuevos recolectores o activa/desactiva su disponibilidad diaria:
          </Text>

          {/* FORMULARIO NUEVO RECOLECTOR */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>➕ Agregar Nuevo Asociado</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre del recolector (ej. Pedro Pérez)"
              placeholderTextColor="#94A3B8"
              value={nuevoNombre}
              onChangeText={setNuevoNombre}
            />
            <TextInput
              style={styles.input}
              placeholder="Celular WhatsApp (ej. 573001234567)"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={nuevoTelefono}
              onChangeText={setNuevoTelefono}
            />
            <TextInput
              style={styles.input}
              placeholder="Capacidad máxima de carga en Kg (ej. 50)"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={nuevoCapacidad}
              onChangeText={setNuevoCapacidad}
            />

            <TouchableOpacity
              style={[styles.checkboxRow, esVehiculo && styles.checkboxActive]}
              onPress={() => setEsVehiculo(!esVehiculo)}
            >
              <Text style={styles.checkboxText}>
                {esVehiculo ? '🛺 Es un vehículo motorizado' : '🚶 Es recolector a pie / carretilla'} (Toca para cambiar)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addBtn} onPress={agregarNuevoRecolector}>
              <Text style={styles.addBtnText}>Guardar Asociado en la Flota</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.pageTitle, { marginTop: 15 }]}>Listado de Asociados Actuales</Text>
          {flota.map((rec) => (
            <View key={rec.id} style={styles.fleetCard}>
              <View style={{ flex: 1 }}>
                <View style={styles.fleetRow}>
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: rec.colorRuta },
                    ]}
                  />
                  <Text style={styles.fleetName}>{rec.nombre}</Text>
                </View>
                <Text style={styles.fleetDetails}>
                  {rec.etiqueta} • Cap. Máx: {rec.capacidadMaxKg} kg • Tel: {rec.telefono}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  rec.activo ? styles.toggleActive : styles.toggleInactive,
                ]}
                onPress={() => toggleRecolectorActivo(rec.id)}
              >
                <Text style={styles.toggleText}>
                  {rec.activo ? 'ACTIVO' : 'INACTIVO'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* PESTAÑA 3: IMPACTO */}
      {tabActiva === 'IMPACTO' && (
        <ScrollView style={styles.tabContent}>
          <Text style={styles.pageTitle}>Impacto de la Zonificación</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>
                {metricas.kilosRecuperados} kg
              </Text>
              <Text style={styles.metricLabel}>Material recuperado</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>
                {metricas.horasSolEvitadas} hrs
              </Text>
              <Text style={styles.metricLabel}>
                Caminata al sol ahorrada (Peatones)
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>
                {metricas.litrosGasolinaAhorrados} L
              </Text>
              <Text style={styles.metricLabel}>
                Combustible ahorrado (Vehículos)
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{metricas.kmAhorrados} km</Text>
              <Text style={styles.metricLabel}>
                Cruces de ruta eliminados por zonas
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* NAVEGACIÓN INFERIOR */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setTabActiva('MAPA')}
        >
          <Text
            style={[
              styles.tabText,
              tabActiva === 'MAPA' && styles.tabTextActive,
            ]}
          >
            🗺️ Mapa Zonal
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setTabActiva('FLOTA')}
        >
          <Text
            style={[
              styles.tabText,
              tabActiva === 'FLOTA' && styles.tabTextActive,
            ]}
          >
            👷 Flota ({flota.filter(f => f.activo).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setTabActiva('IMPACTO')}
        >
          <Text
            style={[
              styles.tabText,
              tabActiva === 'IMPACTO' && styles.tabTextActive,
            ]}
          >
            📊 Impacto
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// 4. ESTILOS
// ==========================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  headerSubtitle: { color: '#38BDF8', fontSize: 12, marginTop: 2 },
  simularBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  simularBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  contentContainer: { flex: 1 },
  map: { flex: 1 },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '52%',
    elevation: 12,
  },
  primaryBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  plansScroll: { marginTop: 4 },
  planCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planWorkerName: { fontWeight: 'bold', fontSize: 14, color: '#0F172A' },
  planWeightBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  planZoneText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    marginVertical: 4,
  },
  stopLine: { fontSize: 12, color: '#334155', marginLeft: 4, marginBottom: 2 },
  waDispatchBtn: {
    backgroundColor: '#16A34A',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  waDispatchText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  tabContent: { flex: 1, padding: 16 },
  pageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 6,
  },
  helperText: { fontSize: 13, color: '#475569', marginBottom: 14 },
  formCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 10,
  },
  formTitle: { fontWeight: 'bold', fontSize: 15, color: '#0F172A', marginBottom: 10 },
  input: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    color: '#0F172A',
  },
  checkboxRow: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkboxActive: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
  },
  checkboxText: { fontSize: 12, fontWeight: 'bold', color: '#0369A1' },
  addBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  addBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  fleetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fleetRow: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  fleetName: { fontWeight: 'bold', fontSize: 15, color: '#0F172A' },
  fleetDetails: { fontSize: 12, color: '#64748B', marginTop: 4 },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleActive: { backgroundColor: '#16A34A' },
  toggleInactive: { backgroundColor: '#94A3B8' },
  toggleText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 11 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricValue: { fontSize: 24, fontWeight: 'bold', color: '#16A34A' },
  metricLabel: { fontSize: 12, color: '#475569', marginTop: 4 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
  },
  tabItem: { flex: 1, alignItems: 'center' },
  tabText: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  tabTextActive: { color: '#0F172A', fontWeight: 'bold' },
});