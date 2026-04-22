import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, type MobileBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { useMobileAuth } from '@/lib/auth-session';
import { useMobileTheme } from '@/src/theme/mobile-theme';

type HistoryKpis = {
  totalRevenue?: number;
  totalOrders?: number;
  averageTicket?: number;
};

type HistoryResponse = {
  ok?: boolean;
  kpis?: HistoryKpis;
  range?: {
    label?: string;
  };
  paymentMethodBreakdown?: Array<{
    method?: string;
    total?: number;
  }>;
  hourlySales?: Array<{
    hour?: string;
    total?: number;
  }>;
};

type TablesResponse = {
  ok?: boolean;
  tables?: Array<{
    table?: string;
    occupied?: boolean;
    status?: string;
    cliente_nombre?: string;
  }>;
};

type MetricCard = {
  id: string;
  label: string;
  value: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPaymentMethod(value: string) {
  const normalized = String(value || 'otro').trim().toLowerCase();

  if (normalized === 'efectivo') {
    return 'Efectivo';
  }

  if (normalized === 'tarjeta' || normalized === 'punto') {
    return 'Punto';
  }

  if (normalized === 'transferencia') {
    return 'Transferencia';
  }

  if (normalized === 'binance') {
    return 'Binance';
  }

  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Otro';
}

function getTableStatusLabel(value: string) {
  const normalized = String(value || 'disponible').trim().toLowerCase();

  if (normalized === 'en_cocina' || normalized === 'en cocina') {
    return 'En cocina';
  }

  if (normalized === 'entregado') {
    return 'Entregado';
  }

  if (normalized === 'limpieza') {
    return 'Limpieza';
  }

  if (normalized === 'pagado') {
    return 'Pagado';
  }

  return 'Disponible';
}

export default function CajaMobileScreen() {
  const { session, logout } = useMobileAuth();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [cards, setCards] = useState<MetricCard[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<Array<{ method: string; total: number }>>([]);
  const [hourlySales, setHourlySales] = useState<Array<{ hour: string; total: number }>>([]);
  const [activeTables, setActiveTables] = useState<Array<{ table: string; status: string; cliente: string }>>([]);
  const [rangeLabel, setRangeLabel] = useState('Periodo actual');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const requestJson = useCallback(
    async <T,>(path: string) => {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session?.token || ''}`,
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.message || 'No se pudo cargar el panel de caja.'));
      }

      return payload as T;
    },
    [session?.token],
  );

  const loadCajaData = useCallback(
    async (showSkeleton = false) => {
      if (showSkeleton) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setErrorMessage('');

      try {
        const [history, tables] = await Promise.all([
          requestJson<HistoryResponse>('/api/orders/history?range=today'),
          requestJson<TablesResponse>('/api/tables/status'),
        ]);

        const revenue = Number(history.kpis?.totalRevenue || 0);
        const totalOrders = Number(history.kpis?.totalOrders || 0);
        const averageTicket = Number(history.kpis?.averageTicket || 0);
        const occupiedTables = (tables.tables || [])
          .filter((table) => Boolean(table.occupied))
          .map((table) => ({
            table: String(table.table || '--'),
            status: getTableStatusLabel(String(table.status || 'disponible')),
            cliente: String(table.cliente_nombre || '').trim(),
          }));

        setCards([
          {
            id: 'ventas',
            label: 'Ventas hoy',
            value: formatCurrency(revenue),
            helper: 'Ingresos procesados hoy',
            icon: 'cash-outline',
          },
          {
            id: 'ordenes',
            label: 'Ordenes',
            value: String(totalOrders),
            helper: 'Tickets cerrados en el turno',
            icon: 'receipt-outline',
          },
          {
            id: 'ticket',
            label: 'Ticket promedio',
            value: formatCurrency(averageTicket),
            helper: `${occupiedTables.length} mesas activas ahora`,
            icon: 'stats-chart-outline',
          },
        ]);
        setPaymentBreakdown(
          (history.paymentMethodBreakdown || []).map((item) => ({
            method: formatPaymentMethod(String(item.method || 'otro')),
            total: Number(item.total || 0),
          })),
        );
        setHourlySales(
          (history.hourlySales || []).map((item) => ({
            hour: String(item.hour || '--'),
            total: Number(item.total || 0),
          })),
        );
        setActiveTables(occupiedTables);
        setRangeLabel(String(history.range?.label || 'Periodo actual'));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo cargar la operación de caja.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [requestJson],
  );

  useEffect(() => {
    void loadCajaData(true);
  }, [loadCajaData]);

  if (!session) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CAJA MOBILE</Text>
          <Text style={styles.title}>Cierre y monitoreo</Text>
          <Text style={styles.subtitle}>Resumen operativo de {rangeLabel}. Sesión activa para {session.nombre || session.usuario}.</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.ghostButton} onPress={() => void loadCajaData(false)}>
            <Text style={styles.ghostButtonText}>{isRefreshing ? 'Actualizando...' : 'Actualizar'}</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={logout}>
            <Text style={styles.primaryButtonText}>Salir</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.accent.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadCajaData(false)} tintColor={theme.accent.primary} />}>
          {errorMessage ? <Text style={styles.errorBox}>{errorMessage}</Text> : null}

          <View style={styles.section}>
            {cards.map((card) => (
              <View key={card.id} style={styles.metricCard}>
                <View style={styles.metricIconWrap}>
                  <Ionicons name={card.icon} size={18} color={theme.accent.primary} />
                </View>
                <Text style={styles.metricLabel}>{card.label}</Text>
                <Text style={styles.metricValue}>{card.value}</Text>
                <Text style={styles.metricHelper}>{card.helper}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>COBRO</Text>
              <Text style={styles.sectionTitle}>Métodos de pago</Text>
            </View>
          </View>

          <View style={styles.section}>
            {paymentBreakdown.length ? (
              paymentBreakdown.map((item) => (
                <View key={item.method} style={styles.listCard}>
                  <Text style={styles.listTitle}>{item.method}</Text>
                  <Text style={styles.listValue}>{formatCurrency(item.total)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>Sin pagos registrados</Text>
                <Text style={styles.emptyCardText}>Cuando existan cobros del día, el desglose aparecerá aquí.</Text>
              </View>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>SALA</Text>
              <Text style={styles.sectionTitle}>Mesas activas</Text>
            </View>
          </View>

          <View style={styles.section}>
            {activeTables.length ? (
              activeTables.map((table) => (
                <View key={table.table} style={styles.listCardColumn}>
                  <View style={styles.listRowBetween}>
                    <Text style={styles.listTitle}>{table.table}</Text>
                    <Text style={styles.statusBadge}>{table.status}</Text>
                  </View>
                  <Text style={styles.listMeta}>{table.cliente || 'Sin cliente registrado'}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>No hay mesas ocupadas</Text>
                <Text style={styles.emptyCardText}>El mapa operativo está libre en este momento.</Text>
              </View>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>HORARIO</Text>
              <Text style={styles.sectionTitle}>Ventas por hora</Text>
            </View>
          </View>

          <View style={styles.section}>
            {hourlySales.length ? (
              hourlySales.map((slot) => (
                <View key={slot.hour} style={styles.listCard}>
                  <Text style={styles.listTitle}>{slot.hour}</Text>
                  <Text style={styles.listValue}>{formatCurrency(slot.total)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardTitle}>Todavía no hay cortes horarios</Text>
                <Text style={styles.emptyCardText}>Las ventas del rango seleccionado aparecerán aquí apenas se registren pagos.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: MobileBrandTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background.deepCarbon,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      gap: 14,
    },
    headerCopy: {
      gap: 8,
    },
    eyebrow: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 3,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    title: {
      color: theme.text.primary,
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    subtitle: {
      color: theme.text.secondary,
      fontSize: 14,
      lineHeight: 22,
      fontFamily: Fonts?.sans,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 10,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 42,
      gap: 16,
    },
    sectionHeader: {
      marginTop: 4,
      marginBottom: -4,
    },
    sectionEyebrow: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 3,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    sectionTitle: {
      color: theme.text.primary,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
      marginTop: 4,
    },
    section: {
      gap: 12,
    },
    metricCard: {
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.card,
      padding: 18,
      gap: 10,
    },
    metricIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${theme.accent.primary}18`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.accent,
    },
    metricLabel: {
      color: theme.text.muted,
      fontSize: 12,
      letterSpacing: 2,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    metricValue: {
      color: theme.text.primary,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    metricHelper: {
      color: theme.text.secondary,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: Fonts?.sans,
    },
    listCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      padding: 16,
    },
    listCardColumn: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      padding: 16,
      gap: 6,
    },
    listRowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    listTitle: {
      color: theme.text.primary,
      fontSize: 16,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    listValue: {
      color: theme.accent.primary,
      fontSize: 15,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    listMeta: {
      color: theme.text.secondary,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: Fonts?.sans,
    },
    statusBadge: {
      color: theme.text.onAccent,
      backgroundColor: theme.accent.primary,
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    emptyCard: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      padding: 18,
      gap: 8,
    },
    emptyCardTitle: {
      color: theme.text.primary,
      fontSize: 16,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    emptyCardText: {
      color: theme.text.secondary,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: Fonts?.sans,
    },
    primaryButton: {
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: theme.accent.primary,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: theme.text.onAccent,
      fontSize: 14,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    ghostButton: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostButtonText: {
      color: theme.text.primary,
      fontSize: 14,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorBox: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.status.error,
      backgroundColor: `${theme.status.error}18`,
      color: theme.status.error,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: Fonts?.sans,
    },
  });