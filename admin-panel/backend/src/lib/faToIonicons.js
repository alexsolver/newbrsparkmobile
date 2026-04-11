'use strict';

/**
 * Mapeia nomes de ícones do CMS Web (react-icons/fa, ex. FaHammer) para Ionicons
 * usados no app React Native (expo-vector-icons).
 */
const MAP = {
  FaHammer: 'hammer-outline',
  FaBroom: 'sparkles-outline',
  FaCar: 'car-outline',
  FaLaptop: 'laptop-outline',
  FaHeart: 'heart-outline',
  FaUtensils: 'restaurant-outline',
  FaTools: 'construct-outline',
  FaWrench: 'build-outline',
  FaPlug: 'flash-outline',
  FaBolt: 'flash-outline',
  FaLightbulb: 'bulb-outline',
  FaHome: 'home-outline',
  FaPaintRoller: 'color-palette-outline',
  FaShower: 'water-outline',
  FaCouch: 'bed-outline',
  FaBed: 'bed-outline',
  FaKey: 'key-outline',
  FaDoorOpen: 'enter-outline',
  FaToilet: 'water-outline',
  FaHardHat: 'construct-outline',
  FaMotorcycle: 'bicycle-outline',
  FaTruck: 'car-outline',
  FaBus: 'bus-outline',
  FaTaxi: 'car-outline',
  FaGasPump: 'flame-outline',
  FaOilCan: 'water-outline',
  FaCarBattery: 'battery-charging-outline',
  FaChargingStation: 'flash-outline',
  FaFirstAid: 'medkit-outline',
  FaSpa: 'flower-outline',
  FaCut: 'cut-outline',
  FaUserMd: 'person-outline',
  FaStethoscope: 'medical-outline',
  FaSyringe: 'medical-outline',
  FaPills: 'medkit-outline',
  FaTooth: 'happy-outline',
  FaMobileAlt: 'phone-portrait-outline',
  FaWifi: 'wifi-outline',
  FaDesktop: 'desktop-outline',
  FaTabletAlt: 'tablet-portrait-outline',
  FaKeyboard: 'keypad-outline',
  FaMouse: 'hardware-chip-outline',
  FaPrint: 'print-outline',
  FaCamera: 'camera-outline',
  FaVideo: 'videocam-outline',
  FaMicrophone: 'mic-outline',
  FaHeadphones: 'headset-outline',
  FaGamepad: 'game-controller-outline',
  FaRobot: 'hardware-chip-outline',
  FaPaw: 'paw-outline',
  FaDog: 'paw-outline',
  FaCat: 'paw-outline',
  FaHorse: 'paw-outline',
  FaShoppingBag: 'bag-handle-outline',
  FaBriefcase: 'briefcase-outline',
  FaStore: 'storefront-outline',
  FaBuilding: 'business-outline',
  FaMapMarkerAlt: 'location-outline',
  FaStar: 'star-outline',
  FaFire: 'flame-outline',
  FaLeaf: 'leaf-outline',
  FaTree: 'leaf-outline',
  FaSun: 'sunny-outline',
  FaMoon: 'moon-outline',
  FaCloud: 'cloud-outline',
  FaSnowflake: 'snow-outline',
};

function faToIonicons(faName) {
  if (faName == null || typeof faName !== 'string') return 'construct-outline';
  const t = faName.trim();
  if (!t) return 'construct-outline';
  if (t.includes('-outline') || t.includes('-')) {
    return t;
  }
  return MAP[t] || 'construct-outline';
}

module.exports = { faToIonicons, MAP };
