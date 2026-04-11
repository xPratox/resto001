import axios, { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { RestoBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';

type OrderItem = {
  _id?: string;
  name: string;
  price: number;
  note: string;
  notas?: string;
  observaciones?: string;
};

type ActiveOrder = {
  _id: string;
  table: string;
  items: OrderItem[];
  total: number;
  montoPagado?: number;
  status: 'pendiente' | 'en cocina' | 'limpieza' | 'pagado';
  hora_pago?: string | null;
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: 'Bebidas' | 'Platos';
};

type BackendMenuItem = Partial<MenuItem> & {
  nombre?: string;
  categoria?: string;
};

const QUICK_NOTES = {
  Bebidas: ['Sin hielo', 'Poco azucar', 'Vaso aparte'],
  Platos: ['Sin sal', 'Con todo', 'Extra salsa'],
} as const;

const brand = RestoBrandTheme;

function getItemNote(item: Partial<OrderItem>) {
  return item.note || item.notas || item.observaciones || 'Sin notas';
}

function normalizeOrder(order: ActiveOrder): ActiveOrder {
  return {
    _id: order._id,
    table: order.table,
    items: (order.items ?? []).map((item) => ({
      _id: item._id,
      name: item.name,
      price: Number(item.price ?? 0),
      note: getItemNote(item),
      notas: item.notas,
      observaciones: item.observaciones,
    })),
    total: Number(order.total ?? 0),
    montoPagado: Number(order.montoPagado ?? 0),
    status: order.status ?? 'pendiente',
  };
}

function normalizeMenuItem(item: BackendMenuItem, index: number): MenuItem | null {
  const name = typeof item.name === 'string' ? item.name : typeof item.nombre === 'string' ? item.nombre : '';
  const category =
    item.category === 'Bebidas' || item.category === 'Platos'
      ? item.category
      : item.categoria === 'Bebidas' || item.categoria === 'Platos'
        ? item.categoria
        : 'Platos';

  if (!name) {
    return null;
  }

  return {
    id: typeof item.id === 'string' && item.id ? item.id : `menu-${index}`,
    name,
    price: Number(item.price ?? 0),
    category,
  };
}

export default function ActiveOrderScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const router = useRouter();
  const { table, orderId } = useLocalSearchParams<{ table?: string; orderId?: string }>();
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [tempOrderItems, setTempOrderItems] = useState<OrderItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isCustomizationVisible, setIsCustomizationVisible] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [customizationNote, setCustomizationNote] = useState('');
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const hasLocalEditsRef = useRef(false);

  const liveTotal = useMemo(() => {
    return tempOrderItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  }, [tempOrderItems]);

  const canEditOrder = order?.status !== 'pagado' && order?.status !== 'limpieza';

  const setEditingState = useCallback((value: boolean) => {
    hasLocalEditsRef.current = value;
    setHasLocalEdits(value);
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      setErrorMessage('');
      setIsLoadingOrder(true);

      if (orderId) {
        const response = await axios.get<{ order: ActiveOrder }>(`${API_BASE_URL}/api/orders/${orderId}`);
        const normalizedOrder = normalizeOrder(response.data.order);
        setOrder(normalizedOrder);

        if (!hasLocalEditsRef.current) {
          setTempOrderItems(normalizedOrder.items);
          setEditingState(false);
        }

        return;
      }

      if (table) {
        const response = await axios.get<{ order: ActiveOrder }>(
          `${API_BASE_URL}/api/orders/active/table/${encodeURIComponent(table)}`,
        );
        const normalizedOrder = normalizeOrder(response.data.order);
        setOrder(normalizedOrder);

        if (!hasLocalEditsRef.current) {
          setTempOrderItems(normalizedOrder.items);
          setEditingState(false);
        }
      }
    } catch {
      setErrorMessage('No se pudo cargar el pedido activo de la mesa.');
    } finally {
      setIsLoadingOrder(false);
    }
  }, [orderId, setEditingState, table]);

  const fetchMenu = useCallback(async () => {
    try {
      setIsLoadingMenu(true);
      const response = await axios.get<{ items?: BackendMenuItem[] }>(`${API_BASE_URL}/api/menu`);
      const normalizedItems = Array.isArray(response.data.items)
        ? response.data.items
            .map((item, index) => normalizeMenuItem(item, index))
            .filter((item): item is MenuItem => item !== null)
        : [];

      setMenuItems(normalizedItems);
    } catch (error) {
      if (isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message || 'No se pudo cargar el catalogo de productos.');
      } else {
        setErrorMessage('No se pudo cargar el catalogo de productos.');
      }
    } finally {
      setIsLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const handleRemoveItem = (itemToRemove: OrderItem, itemIndex: number) => {
    if (!order || !canEditOrder) {
      return;
    }

    Alert.alert(
      'Eliminar producto',
      `Vas a eliminar ${itemToRemove.name} del pedido en edición.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setTempOrderItems((current) => current.filter((_, index) => index !== itemIndex));
            setEditingState(true);
            setSuccessMessage(`${itemToRemove.name} fue quitado localmente. Confirma cambios para sincronizar.`);
          },
        },
      ],
    );
  };

  const handleOpenMenu = async () => {
    setIsMenuVisible(true);

    if (menuItems.length > 0 || isLoadingMenu) {
      return;
    }

    await fetchMenu();
  };

  const handleSelectMenuItem = (menuItem: MenuItem) => {
    if (!canEditOrder) {
      return;
    }

    setSelectedMenuItem(menuItem);
    setCustomizationNote('');
    setIsCustomizationVisible(true);
  };

  const handleAddCustomizedItem = () => {
    if (!selectedMenuItem || !canEditOrder) {
      return;
    }

    const normalizedNote = customizationNote.trim() || 'Sin notas';

    setTempOrderItems((current) => [
      ...current,
      {
        name: selectedMenuItem.name,
        price: selectedMenuItem.price,
        note: normalizedNote,
        notas: normalizedNote,
      },
    ]);
    setEditingState(true);

    setSuccessMessage(`${selectedMenuItem.name} agregado al pedido en edición.`);
    setIsCustomizationVisible(false);
    setCustomizationNote('');
    setSelectedMenuItem(null);
    setIsMenuVisible(false);
  };

  const quickNotesForSelectedItem = selectedMenuItem ? QUICK_NOTES[selectedMenuItem.category] : QUICK_NOTES.Platos;

  const handleSyncOrder = async () => {
    if (!order) {
      return;
    }

    try {
      setIsUpdating(true);
      setErrorMessage('');
      setSuccessMessage('');

      const response = await axios.patch<{ order: ActiveOrder; message: string }>(
        `${API_BASE_URL}/api/orders/${order._id}/sync`,
        {
          items: tempOrderItems,
        },
      );

      const syncedOrder = normalizeOrder(response.data.order);
      const successCopy = response.data.message || 'Pedido actualizado correctamente.';
      setOrder(syncedOrder);
      setTempOrderItems(syncedOrder.items);
      setEditingState(false);
      setSuccessMessage(successCopy);

      Alert.alert('Pedido actualizado', successCopy, [
        {
          text: 'OK',
          onPress: () => {
            router.replace({
              pathname: '/',
              params: {
                orderUpdatedSuccess: successCopy,
              },
            });
          },
        },
      ]);
    } catch (error) {
      if (isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message || 'No se pudo actualizar el pedido.');
      } else {
        setErrorMessage('No se pudo actualizar el pedido.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePayment = () => {
    if (!order) {
      return;
    }

    Alert.alert('Cerrar cuenta', `¿Desea cerrar la cuenta de la ${order.table}?`, [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Cobrar',
        onPress: async () => {
          try {
            setIsUpdating(true);
            setErrorMessage('');
            setSuccessMessage('');

            const response = await axios.patch<{ order: ActiveOrder; message: string }>(
              `${API_BASE_URL}/api/orders/${order._id}/pay`,
              {
                items: tempOrderItems,
                metodo: 'efectivo',
                estado: 'completado',
                montoRecibido: Math.max(0, Number((order.total - Number(order.montoPagado || 0)).toFixed(2))),
              },
            );

            const paidOrder = normalizeOrder(response.data.order);
            const successCopy = '¡Mesa enviada a limpieza!';

            setOrder(paidOrder);
            setTempOrderItems(paidOrder.items);
            setEditingState(false);
            setSuccessMessage(successCopy);

            Alert.alert('Pago confirmado', successCopy, [
              {
                text: 'OK',
                onPress: () => {
                  navigation.navigate('Tables', {
                    paymentSuccess: successCopy,
                  });
                },
              },
            ]);
          } catch (error) {
            if (isAxiosError(error)) {
              setErrorMessage(error.response?.data?.message || 'No se pudo cerrar la cuenta.');
            } else {
              setErrorMessage('No se pudo cerrar la cuenta.');
            }
          } finally {
            setIsUpdating(false);
          }
        },
      },
    ]);
  };

  const handleCancelOrder = () => {
    if (!order) {
      return;
    }

    Alert.alert(
      '¿Cancelar Pedido?',
      'Esta acción liberará la mesa y eliminará el pedido actual. ¿Desea continuar?',
      [
        {
          text: 'Volver',
          style: 'cancel',
        },
        {
          text: 'Cancelar pedido',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUpdating(true);
              setErrorMessage('');
              setSuccessMessage('');

              const response = await axios.delete<{ message: string }>(`${API_BASE_URL}/api/orders/${order._id}`);
              const successCopy = response.data.message || 'Pedido cancelado y mesa liberada.';

              setOrder(null);
              setTempOrderItems([]);
              setEditingState(false);
              setSuccessMessage(successCopy);

              Alert.alert('Pedido cancelado', successCopy, [
                {
                  text: 'OK',
                  onPress: () => {
                    navigation.navigate('Tables', {
                      orderUpdatedSuccess: successCopy,
                    });
                  },
                },
              ]);
            } catch (error) {
              if (isAxiosError(error)) {
                setErrorMessage(error.response?.data?.message || 'No se pudo cancelar el pedido.');
              } else {
                setErrorMessage('No se pudo cancelar el pedido.');
              }
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ],
    );
  };

  const renderOrderItem = ({ item, index }: { item: OrderItem; index: number }) => {
    return (
      <View style={styles.orderRow}>
        <View style={styles.itemCopy}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemNote}>{getItemNote(item)}</Text>
        </View>

        <View style={styles.rowActions}>
          <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
          {canEditOrder ? (
            <Pressable onPress={() => handleRemoveItem(item, index)} style={styles.removeButton}>
              <Ionicons name="trash-outline" size={20} color={brand.status.error} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screenHeader}>
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }

            navigation.navigate('Tables');
          }}
          hitSlop={10}
          style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color={brand.text.metallicLight} />
        </Pressable>
        <Text style={styles.screenTitle}>Pedido Activo</Text>
      </View>

      {isLoadingOrder ? (
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={brand.accent.sunsetOrange} />
          <Text style={styles.panelMeta}>Cargando pedido...</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {(errorMessage || successMessage) && (
              <View style={styles.feedbackBlock}>
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
                {hasLocalEdits ? (
                  <Text style={styles.editingHint}>Edicion local activa. El pedido no se refresca hasta confirmar cambios.</Text>
                ) : null}
              </View>
            )}

            <View style={styles.orderCard}>
              <View style={styles.orderCardHeader}>
                <Text style={styles.title}>{table || order?.table || 'Mesa activa'}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{String(order?.status || 'cargando').toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.orderItemsList}>
                {tempOrderItems.length > 0 ? (
                  tempOrderItems.map((item, index) => (
                    <View key={`${item._id || item.name}-${item.note}-${index}`}>
                      {renderOrderItem({ item, index })}
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.itemNote}>No hay productos agregados.</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.totalRow}>
                <Text style={styles.summaryLabel}>Total acumulado</Text>
                <Text style={styles.summaryValue}>${liveTotal.toFixed(2)}</Text>
              </View>
            </View>

            <Pressable
              onPress={() => void handleOpenMenu()}
              disabled={!canEditOrder}
              style={[styles.openMenuAction, !canEditOrder && styles.disabledButton]}>
              <Text style={styles.openMenuButtonText}>+ Agregar más productos</Text>
            </Pressable>
          </ScrollView>

          <View style={styles.stickyFooter}>
            <Pressable
              onPress={handleSyncOrder}
              disabled={!order || !canEditOrder || isUpdating}
              style={[styles.syncButton, (!order || !canEditOrder || isUpdating) && styles.disabledButton]}>
              <Text style={styles.syncButtonText}>{isUpdating ? 'Actualizando...' : 'Confirmar Cambios'}</Text>
            </Pressable>

            <Pressable
              onPress={handlePayment}
              disabled={!order || !tempOrderItems.length || isUpdating}
              style={[styles.payButton, (!order || !tempOrderItems.length || isUpdating) && styles.disabledButton]}>
              <Text style={styles.payButtonText}>{isUpdating ? 'Procesando...' : 'Cobrar y Enviar a Limpieza'}</Text>
            </Pressable>

            <Pressable
              onPress={handleCancelOrder}
              disabled={!order || !canEditOrder || isUpdating}
              style={[styles.cancelButton, (!order || !canEditOrder || isUpdating) && styles.disabledButton]}>
              <Text style={styles.cancelButtonText}>{isUpdating ? 'Procesando...' : 'Cliente canceló pedido'}</Text>
            </Pressable>
          </View>
        </>
      )}

      <Modal animationType="slide" transparent visible={isMenuVisible} onRequestClose={() => setIsMenuVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setIsMenuVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.catalogTitle}>Agregar productos</Text>
            <Text style={styles.catalogSubtitle}>Elige productos para sumarlos al pedido local antes de confirmar.</Text>

            {isLoadingMenu ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="small" color={brand.accent.sunsetOrange} />
                <Text style={styles.panelMeta}>Cargando catálogo...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.modalListContent} showsVerticalScrollIndicator={false}>
                {menuItems.map((item) => (
                  <View key={item.id} style={styles.catalogItemCard}>
                    <View style={styles.itemCopy}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemNote}>{item.category}</Text>
                    </View>

                    <View style={styles.rowActions}>
                      <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                      <Pressable onPress={() => handleSelectMenuItem(item)} style={styles.catalogAddButton}>
                        <Text style={styles.catalogAddButtonText}>Agregar</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isCustomizationVisible}
        onRequestClose={() => {
          setIsCustomizationVisible(false);
          setSelectedMenuItem(null);
          setCustomizationNote('');
        }}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => {
              setIsCustomizationVisible(false);
              setSelectedMenuItem(null);
              setCustomizationNote('');
            }}
          />
          <View style={styles.customizationCard}>
            <Text style={styles.catalogTitle}>{selectedMenuItem?.name || 'Personalizar producto'}</Text>
            <Text style={styles.catalogSubtitle}>Agrega observaciones para este producto antes de sumarlo al pedido.</Text>

            <TextInput
              value={customizationNote}
              onChangeText={setCustomizationNote}
              placeholder="Ej: Sin cebolla, extra salsa"
              placeholderTextColor={brand.text.metallicSoft}
              multiline
              style={styles.customizationInput}
            />

            <View style={styles.quickNotesRow}>
              {quickNotesForSelectedItem.map((quickNote) => (
                <Pressable
                  key={quickNote}
                  onPress={() => setCustomizationNote(quickNote)}
                  style={styles.quickNoteButton}>
                  <Text style={styles.quickNoteText}>{quickNote}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={handleAddCustomizedItem} style={styles.customizationActionButton}>
              <Text style={styles.customizationActionText}>Añadir al pedido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: brand.background.deepCarbon,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 238,
  },
  screenHeader: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    color: brand.text.metallicLight,
    fontSize: 28,
    fontWeight: '700',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  headerSection: {
    gap: 10,
  },
  feedbackBlock: {
    gap: 8,
    marginBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: brand.text.metallicLight,
    fontSize: 22,
    fontWeight: '800',
  },
  statusBadge: {
    borderWidth: 1,
    borderColor: brand.accent.sunsetOrange,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  statusBadgeText: {
    color: brand.accent.sunsetOrange,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  disabledButton: {
    opacity: 0.45,
  },
  errorText: {
    color: brand.status.error,
    fontSize: 14,
  },
  successText: {
    color: brand.status.success,
    fontSize: 14,
    fontWeight: '800',
  },
  editingHint: {
    color: brand.text.metallicMuted,
    fontSize: 13,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loaderText: {
    color: brand.text.metallicMuted,
    fontSize: 14,
  },
  orderCard: {
    backgroundColor: brand.background.slateAccent,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    borderRadius: 14,
    overflow: 'hidden',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  cardDivider: {
    height: 1,
    backgroundColor: brand.border.subtle,
    marginHorizontal: 0,
  },
  orderItemsList: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
  },
  itemCopy: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    color: brand.text.metallicLight,
    fontSize: 16,
    fontWeight: '700',
  },
  itemNote: {
    color: brand.text.metallicMuted,
    fontSize: 13,
  },
  rowActions: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 14,
  },
  itemPrice: {
    color: brand.text.metallicLight,
    fontSize: 16,
    fontWeight: '800',
  },
  removeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  openMenuAction: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },
  openMenuButtonText: {
    color: brand.accent.sunsetOrange,
    fontSize: 17,
    fontWeight: '800',
  },
  catalogSection: {
    display: 'none',
  },
  catalogTitle: {
    color: brand.text.metallicLight,
    fontSize: 20,
    fontWeight: '800',
  },
  catalogSubtitle: {
    color: brand.text.metallicMuted,
    fontSize: 13,
  },
  catalogItemCard: {
    borderRadius: 16,
    backgroundColor: brand.background.slateAccent,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  catalogAddButton: {
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: brand.accent.sunsetOrange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  catalogAddButtonText: {
    color: brand.text.contrastOnAccent,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryLabel: {
    color: brand.text.metallicLight,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryValue: {
    color: brand.text.metallicLight,
    fontSize: 18,
    fontWeight: '800',
  },
  stickyFooter: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: brand.background.deepCarbon,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: brand.border.subtle,
  },
  syncButton: {
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: brand.accent.sunsetOrange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  syncButtonText: {
    color: brand.text.contrastOnAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  payButton: {
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: brand.status.success,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  payButtonText: {
    color: brand.text.metallicLight,
    fontSize: 16,
    fontWeight: '800',
  },
  cancelButton: {
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: brand.status.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: brand.text.metallicLight,
    fontSize: 16,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: brand.overlay.scrim,
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalCard: {
    maxHeight: '72%',
    backgroundColor: brand.background.deepCarbon,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: brand.border.subtle,
  },
  customizationCard: {
    backgroundColor: brand.background.slateAccent,
    borderRadius: 24,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  modalListContent: {
    gap: 12,
    paddingBottom: 20,
  },
  customizationInput: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    color: brand.text.metallicLight,
    backgroundColor: brand.background.deepCarbon,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  quickNotesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickNoteButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    backgroundColor: brand.background.deepCarbon,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickNoteText: {
    color: brand.text.metallicLight,
    fontSize: 13,
    fontWeight: '700',
  },
  customizationActionButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: brand.accent.sunsetOrange,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  customizationActionText: {
    color: brand.text.contrastOnAccent,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyState: {
    paddingVertical: 18,
  },
  panelMeta: {
    marginTop: 4,
    color: brand.text.metallicMuted,
    fontSize: 14,
  },
});