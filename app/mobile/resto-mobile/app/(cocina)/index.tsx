import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, type MobileBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { useMobileAuth } from '@/lib/auth-session';
import { restoSocket } from '@/lib/socket';
import { useMobileTheme } from '@/src/theme/mobile-theme';

type KitchenOrder = {
  idPedido?: string;
  _id?: string;
  numeroMesa?: string;
  table?: string;
  mesa?: string;
  clienteNombre?: string;
  cliente_nombre?: string;
  status?: string;
  createdAt?: string | null;
  items?: Array<{
    nombre?: string;
    name?: string;
    cantidad?: number;
    qty?: number;
    notas?: string;
    note?: string;
  }>;
};

type KitchenQueueResponse = {
  ok?: boolean;
  orders?: KitchenOrder[];
};

type NormalizedKitchenOrder = {
  id: string;
  mesa: string;
  cliente: string;
  status: string;
  createdAt: string | null;
  items: Array<{ nombre: string; cantidad: number; notas: string }>;
};

function normalizeKitchenOrder(order: KitchenOrder, index: number): NormalizedKitchenOrder | null {
  const id = String(order.idPedido || order._id || `kitchen-${index}`);
  const mesa = String(order.numeroMesa || order.table || order.mesa || '').trim();

  if (!mesa) {
    return null;
  }

  return {
    id,
    mesa,
    cliente: String(order.clienteNombre || order.cliente_nombre || '').trim(),
    status: String(order.status || 'en_cocina').trim().toLowerCase(),
    createdAt: order.createdAt || null,
    items: Array.isArray(order.items)
      ? order.items
          .map((item) => ({
            nombre: String(item.nombre || item.name || '').trim(),
            cantidad: Number(item.cantidad || item.qty || 1),
            notas: String(item.notas || item.note || '').trim(),
          }))
          .filter((item) => item.nombre && item.cantidad > 0)
      : [],
  };
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return '--';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate);
}

export default function CocinaMobileScreen() {
  const { session, logout } = useMobileAuth();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [orders, setOrders] = useState<NormalizedKitchenOrder[]>([]);
  const [dispatchingOrderIds, setDispatchingOrderIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const requestJson = useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session?.token || ''}`,
          ...(init?.headers || {}),
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.message || 'No se pudo completar la operación de cocina.'));
      }

      return payload as T;
    },
    [session?.token],
  );

  const loadKitchenQueue = useCallback(
    async (showSkeleton = false) => {
      if (showSkeleton) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const payload = await requestJson<KitchenQueueResponse>('/api/kitchen/orders');
        setOrders(
          (payload.orders || [])
            .map((order, index) => normalizeKitchenOrder(order, index))
            .filter((order): order is NormalizedKitchenOrder => Boolean(order)),
        );
        setErrorMessage('');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo cargar la cola de cocina.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [requestJson],
  );

  useEffect(() => {
    void loadKitchenQueue(true);
  }, [loadKitchenQueue]);

  useEffect(() => {
    const refreshQueue = () => {
      void loadKitchenQueue(false);
    };

    restoSocket.on('kitchen_order_upsert', refreshQueue);
    restoSocket.on('kitchen_order_removed', refreshQueue);
    restoSocket.on('orden_actualizada', refreshQueue);
    restoSocket.on('pedido_entregado', refreshQueue);

    if (!restoSocket.connected) {
      restoSocket.connect();
    }

    return () => {
      restoSocket.off('kitchen_order_upsert', refreshQueue);
      restoSocket.off('kitchen_order_removed', refreshQueue);
      restoSocket.off('orden_actualizada', refreshQueue);
      restoSocket.off('pedido_entregado', refreshQueue);
    };
  }, [loadKitchenQueue]);

  const handleReady = useCallback(
    async (orderId: string) => {
      if (dispatchingOrderIds.includes(orderId)) {
        return;
      }

      setDispatchingOrderIds((currentIds) => [...currentIds, orderId]);
      setErrorMessage('');

      try {
        await requestJson(`/api/kitchen/orders/${orderId}/ready`, { method: 'PATCH' });
        setOrders((currentOrders) => currentOrders.filter((order) => order.id !== orderId));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo marcar el pedido como listo.');
      } finally {
        setDispatchingOrderIds((currentIds) => currentIds.filter((id) => id !== orderId));
      }
    },
    [dispatchingOrderIds, requestJson],
  );

  if (!session) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>COCINA MOBILE</Text>
          <Text style={styles.title}>Cola operativa</Text>
          <Text style={styles.subtitle}>Pedidos en cocina para {session.nombre || session.usuario}. Toque y despacho desde el mismo móvil.</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>En cola</Text>
            <Text style={styles.counterValue}>{orders.length}</Text>
          </View>
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
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadKitchenQueue(false)} tintColor={theme.accent.primary} />}>
          {errorMessage ? <Text style={styles.errorBox}>{errorMessage}</Text> : null}

          {orders.length ? (
            orders.map((order) => {
              const isDispatching = dispatchingOrderIds.includes(order.id);

              return (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View>
                      <Text style={styles.orderEyebrow}>Mesa {order.mesa}</Text>
                      <Text style={styles.orderTitle}>{order.cliente || 'Cliente sin nombre'}</Text>
                    </View>
                    <Text style={styles.orderTime}>{formatDateLabel(order.createdAt)}</Text>
                  </View>

                  <View style={styles.itemsWrap}>
                    {order.items.length ? (
                      order.items.map((item, index) => (
                        <View key={`${order.id}-${item.nombre}-${index}`} style={styles.itemRow}>
                          <View style={styles.itemBullet} />
                          <View style={styles.itemCopy}>
                            <Text style={styles.itemTitle}>{item.cantidad} x {item.nombre}</Text>
                            <Text style={styles.itemMeta}>{item.notas || 'Sin notas adicionales'}</Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.itemMeta}>Sin detalles de productos.</Text>
                    )}
                  </View>

                  <Pressable style={[styles.readyButton, isDispatching && styles.readyButtonDisabled]} onPress={() => void handleReady(order.id)} disabled={isDispatching}>
                    {isDispatching ? <ActivityIndicator size="small" color={theme.text.onAccent} /> : <Text style={styles.readyButtonText}>Marcar listo</Text>}
                  </Pressable>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="restaurant-outline" size={28} color={theme.accent.primary} />
              <Text style={styles.emptyCardTitle}>Sin comandas pendientes</Text>
              <Text style={styles.emptyCardText}>La cola está limpia. Los nuevos pedidos aparecerán aquí en cuanto entren a cocina.</Text>
            </View>
          )}
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
      alignItems: 'center',
      gap: 10,
    },
    counterCard: {
      flex: 1,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 4,
    },
    counterLabel: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 2,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    counterValue: {
      color: theme.accent.primary,
      fontSize: 28,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 42,
      gap: 14,
    },
    orderCard: {
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.card,
      padding: 18,
      gap: 14,
    },
    orderHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    orderEyebrow: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 3,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    orderTitle: {
      marginTop: 4,
      color: theme.text.primary,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    orderTime: {
      color: theme.text.secondary,
      fontSize: 12,
      fontFamily: Fonts?.sans,
    },
    itemsWrap: {
      gap: 10,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    itemBullet: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.accent.primary,
      marginTop: 6,
    },
    itemCopy: {
      flex: 1,
      gap: 3,
    },
    itemTitle: {
      color: theme.text.primary,
      fontSize: 15,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    itemMeta: {
      color: theme.text.secondary,
      fontSize: 13,
      lineHeight: 19,
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
    readyButton: {
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: theme.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    readyButtonDisabled: {
      opacity: 0.6,
    },
    readyButtonText: {
      color: theme.text.onAccent,
      fontSize: 15,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    emptyCard: {
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      padding: 22,
      gap: 10,
      alignItems: 'center',
    },
    emptyCardTitle: {
      color: theme.text.primary,
      fontSize: 18,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    emptyCardText: {
      color: theme.text.secondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
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