/**
 * Mapa único para `useFonts` / `Font.loadAsync`: famílias usadas em checklist, tabs e TaskMetadataGlyph.
 * Pré-carregar no arranque evita em dev pedidos HTTP ao Metro por cada .ttf ao abrir ecrãs offline
 * (ex.: modo avião corta o acesso a 192.168.x.x:8081).
 */
import {
  AntDesign,
  Entypo,
  Feather,
  FontAwesome,
  FontAwesome5,
  Foundation,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
  Octicons,
} from '@expo/vector-icons';

export const VECTOR_ICON_FONT_MAP = {
  ...Ionicons.font,
  ...AntDesign.font,
  ...Entypo.font,
  ...Feather.font,
  ...FontAwesome.font,
  ...FontAwesome5.font,
  ...Foundation.font,
  ...MaterialIcons.font,
  ...MaterialCommunityIcons.font,
  ...Octicons.font,
};
