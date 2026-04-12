import React from 'react';
import {
  Ionicons,
  AntDesign,
  Entypo,
  Feather,
  FontAwesome,
  FontAwesome5,
  Foundation,
  MaterialIcons,
  MaterialCommunityIcons,
  Octicons,
} from '@expo/vector-icons';

/** Ícone de modelo/tarefa (`metadata.icon` + `metadata.iconLibrary`) — paridade com o Form Builder. */
export function TaskMetadataGlyph({
  icon,
  iconLibrary,
  size,
  color,
}: {
  icon?: string | null;
  iconLibrary?: string | null;
  size: number;
  color: string;
}) {
  const name = (icon && String(icon).trim()) || '';
  if (!name) return null;
  const lib = String(iconLibrary || 'Ionicons').trim() || 'Ionicons';
  switch (lib) {
    case 'AntDesign':
      return <AntDesign name={name as any} size={size} color={color} />;
    case 'Entypo':
      return <Entypo name={name as any} size={size} color={color} />;
    case 'Feather':
      return <Feather name={name as any} size={size} color={color} />;
    case 'FontAwesome':
      return <FontAwesome name={name as any} size={size} color={color} />;
    case 'FontAwesome5':
      return <FontAwesome5 name={name as any} size={size} color={color} />;
    case 'Foundation':
      return <Foundation name={name as any} size={size} color={color} />;
    case 'MaterialIcons':
      return <MaterialIcons name={name as any} size={size} color={color} />;
    case 'MaterialCommunityIcons':
      return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
    case 'Octicons':
      return <Octicons name={name as any} size={size} color={color} />;
    case 'Ionicons':
    default:
      return <Ionicons name={name as any} size={size} color={color} />;
  }
}
