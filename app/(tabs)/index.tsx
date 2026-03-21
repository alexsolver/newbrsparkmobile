import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { AssetCard } from '../../src/components/AssetCard';
import { Asset } from '../../src/types/asset';
import { TouchableOpacity } from 'react-native';

const MOCK_ASSETS: Asset[] = [
  {
    id: '1',
    title: 'Bel Air Residence',
    type: 'REAL_ESTATE',
    imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    status: 'MAINTENANCE OK',
    statusType: 'success',
    details: {
      address: '10424 Bellagio Rd, Los Angeles, CA',
    },
  },
  {
    id: '2',
    title: 'Toyota Corolla Hybrid',
    type: 'VEHICLE',
    imageUrl: 'https://images.unsplash.com/photo-1629897048514-3dd741530282?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    status: 'INSURANCE RENEWAL SOON',
    statusType: 'warning',
    details: {
      mileage: 12450,
      year: 2023,
    },
  },
];

export default function DashboardScreen() {
  return (
    <View style={styles.container}>
      <Header />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Portfolio</Text>
          <TouchableOpacity>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>
        
        {MOCK_ASSETS.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF', // Standard iOS blue or use a primary accent
  },
});

