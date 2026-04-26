import axios, { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { type MobileBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { useMobileTheme } from '@/src/theme/mobile-theme';

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

type GroupedMenu = Record<string, MenuItem[]>;

const QUICK_NOTES = {
  Bebidas: ['Sin hielo', 'Poco azucar', 'Vaso aparte'],
  Platos: ['Sin sal', 'Con todo', 'Extra salsa'],
} as const;

function getStatusBadgeStyle(brand: MobileBrandTheme, status?: ActiveOrder['status']) {
  switch (status) {
    case 'limpieza':
      return {
        backgroundColor: brand.status.warning,
        borderColor: brand.status.warning,
        color: brand.text.onAccent,
      };
    case 'pagado':
      return {
        backgroundColor: brand.status.success,
        borderColor: brand.status.success,
        color: brand.text.onAccent,
      };
    case 'en cocina':
      return {
        backgroundColor: brand.status.danger,
        borderColor: brand.status.danger,
        color: brand.text.onAccent,
      };
    case 'pendiente':
    default:
      return {
        backgroundColor: brand.status.info,
        borderColor: brand.status.info,
        color: brand.text.primary,
      };
  }
}

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

function MenuSectionAccordion({
  tituloCategoria,
  itemsList,
  onSelectItem,
  styles,
  brand,
}: {
  tituloCategoria: string;
  itemsList: MenuItem[];
  onSelectItem: (item: MenuItem) => void;
  styles: ReturnType<typeof createStyles>;
  brand: MobileBrandTheme;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.menuAccordionCard}>
      <Pressable onPress={() => setIsOpen((current) => !current)} style={styles.menuAccordionHeader}>
        <Text style={styles.menuAccordionTitle}>{tituloCategoria.toUpperCase()}</Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={isOpen ? brand.accent.sunset : brand.text.metallicLight}
          style={isOpen ? styles.menuAccordionIconOpen : styles.menuAccordionIcon}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.menuAccordionBody}>
          {itemsList.map((item) => (
            <View key={item.id} style={styles.catalogItemCard}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemNote}>{tituloCategoria}</Text>
              </View>

              <View style={styles.rowActions}>
                <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                <Pressable onPress={() => onSelectItem(item)} style={styles.catalogAddButton}>
                  <Text style={styles.catalogAddButtonText}>Agregar</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function ActiveOrderScreen() {
  const { theme: brand, isDark, toggleTheme } = useMobileTheme();
  const styles = useMemo(() => createStyles(brand), [brand]);
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
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const hasLocalEditsRef = useRef(false);

  const liveTotal = useMemo(() => {
    return tempOrderItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  }, [tempOrderItems]);
  const groupedTempOrderItems = useMemo(() => {
    const grouped = new Map<string, { item: OrderItem; quantity: number; firstIndex: number }>();

    tempOrderItems.forEach((item, index) => {
      const note = getItemNote(item);
      const key = `${item.name}::${note}::${item.price}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += 1;
        return;
      }

      grouped.set(key, {
        item,
        quantity: 1,
        firstIndex: index,
      });
    });

    return Array.from(grouped.values());
  }, [tempOrderItems]);
  const groupedMenu = useMemo<GroupedMenu>(() => {
    return menuItems.reduce<GroupedMenu>((groups, item) => {
      const category = String(item.category || 'Menu').trim() || 'Menu';

      if (!groups[category]) {
        groups[category] = [];
      }

      groups[category].push(item);
      return groups;
    }, {});
  }, [menuItems]);

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

  const handleRemoveItem = (itemToRemove: OrderItem, itemIndex: number, shouldConfirm = true) => {
    if (!order || !canEditOrder) {
      return;
    }

    const removeAction = () => {
      setTempOrderItems((current) => current.filter((_, index) => index !== itemIndex));
      setEditingState(true);
      setSuccessMessage(`${itemToRemove.name} fue quitado localmente. Confirma cambios para sincronizar.`);
    };

    if (!shouldConfirm) {
      removeAction();
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
          onPress: removeAction,
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
    setSelectedQuantity(1);
    setIsCustomizationVisible(true);
  };

  const handleAddCustomizedItem = () => {
    if (!selectedMenuItem || !canEditOrder) {
      return;
    }

    const normalizedNote = customizationNote.trim() || 'Sin notas';
    const quantity = Number.isFinite(selectedQuantity) ? Math.max(1, Math.trunc(selectedQuantity)) : 1;
    const itemsBatch = Array.from({ length: quantity }, () => ({
      name: selectedMenuItem.name,
      price: selectedMenuItem.price,
      note: normalizedNote,
      notas: normalizedNote,
    }));

    setTempOrderItems((current) => [
      ...current,
      ...itemsBatch,
    ]);
    setEditingState(true);

    setSuccessMessage(`${selectedMenuItem.name} x${quantity} agregado al pedido en edición.`);
    setIsCustomizationVisible(false);
    setCustomizationNote('');
    setSelectedQuantity(1);
    setSelectedMenuItem(null);
    setIsMenuVisible(false);
  };

  const quickNotesForSelectedItem = selectedMenuItem ? QUICK_NOTES[selectedMenuItem.category] : QUICK_NOTES.Platos;
  const statusBadgeTone = getStatusBadgeStyle(brand, order?.status);

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
              pathname: '/(tabs)',
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
                    router.replace({
                      pathname: '/(tabs)',
                      params: {
                        orderUpdatedSuccess: successCopy,
                      },
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

  const handleAddFromGroup = (item: OrderItem) => {
    if (!canEditOrder) {
      return;
    }

    const note = getItemNote(item);

    setTempOrderItems((current) => [
      ...current,
      {
        name: item.name,
        price: item.price,
        note,
        notas: note,
      },
    ]);
    setEditingState(true);
    setSuccessMessage(`${item.name} agregado al pedido en edición.`);
  };

  const renderOrderItem = ({ item, quantity, index }: { item: OrderItem; quantity: number; index: number }) => {
    const note = getItemNote(item);

    return (
      <View style={styles.orderRow}>
        <View style={styles.itemCopy}>
          <Text style={styles.itemName}>{quantity} x {item.name}</Text>
          <Text style={styles.itemNote}>{note}</Text>
        </View>

        <View style={styles.rowActions}>
          <Text style={styles.itemPrice}>${(item.price * quantity).toFixed(2)}</Text>
          <View style={styles.itemQtyControls}>
            <Pressable
              onPress={() => handleRemoveItem(item, index, quantity === 1)}
              disabled={!canEditOrder || quantity <= 0}
              style={[styles.qtyCircleButton, (!canEditOrder || quantity <= 0) && styles.disabledButton]}>
              <Text style={styles.qtyCircleButtonText}>-</Text>
            </Pressable>
            <Pressable
              onPress={() => handleAddFromGroup(item)}
              disabled={!canEditOrder}
              style={[styles.qtyCircleButton, styles.qtyCircleButtonPlus, !canEditOrder && styles.disabledButton]}>
              <Text style={[styles.qtyCircleButtonText, styles.qtyCircleButtonTextPlus]}>+</Text>
            </Pressable>
          </View>
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
        <Pressable onPress={toggleTheme} hitSlop={10} style={styles.themeToggleButton}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={brand.text.primary} />
        </Pressable>
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
                <View style={[styles.statusBadge, { backgroundColor: statusBadgeTone.backgroundColor, borderColor: statusBadgeTone.borderColor }]}>
                  <Text style={[styles.statusBadgeText, { color: statusBadgeTone.color }]}>{String(order?.status || 'cargando').toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.orderItemsList}>
                {groupedTempOrderItems.length > 0 ? (
                  groupedTempOrderItems.map((group) => (
                    <View key={`${group.item._id || group.item.name}-${getItemNote(group.item)}-${group.item.price}`}>
                      {renderOrderItem({ item: group.item, quantity: group.quantity, index: group.firstIndex })}
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
                {Object.keys(groupedMenu).map((categoria) => (
                  <MenuSectionAccordion
                    key={categoria}
                    tituloCategoria={categoria}
                    itemsList={groupedMenu[categoria] ?? []}
                    onSelectItem={handleSelectMenuItem}
                    styles={styles}
                    brand={brand}
                  />
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
          setSelectedQuantity(1);
        }}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => {
              setIsCustomizationVisible(false);
              setSelectedMenuItem(null);
              setCustomizationNote('');
              setSelectedQuantity(1);
            }}
          />
          <View style={styles.customizationCard}>
            <Text style={styles.catalogTitle}>{selectedMenuItem?.name || 'Personalizar producto'}</Text>
            <Text style={styles.catalogSubtitle}>Agrega observaciones para este producto antes de sumarlo al pedido.</Text>

            <View style={styles.quantitySelectorRow}>
              <Text style={styles.quantityLabel}>Cantidad</Text>
              <View style={styles.quantityControls}>
                <Pressable
                  onPress={() => setSelectedQuantity((current) => Math.max(1, current - 1))}
                  style={styles.quantityButton}
                  accessibilityLabel="Disminuir cantidad">
                  <Text style={styles.quantityButtonText}>-</Text>
                </Pressable>
                <Text style={styles.quantityValue}>{selectedQuantity}</Text>
                <Pressable
                  onPress={() => setSelectedQuantity((current) => current + 1)}
                  style={[styles.quantityButton, styles.quantityButtonAccent]}
                  accessibilityLabel="Aumentar cantidad">
                  <Text style={[styles.quantityButtonText, styles.quantityButtonTextAccent]}>+</Text>
                </Pressable>
              </View>
            </View>

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
              <Text style={styles.customizationActionText}>Añadir x{selectedQuantity} al pedido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (brand: MobileBrandTheme) => StyleSheet.create({
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
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: brand.surface.card,
    borderWidth: 1,
    borderColor: brand.border.subtle,
  },
  themeToggleButton: {
    position: 'absolute',
    right: 16,
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: brand.surface.card,
    borderWidth: 1,
    borderColor: brand.border.subtle,
  },
  screenTitle: {
    color: brand.text.primary,
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
    color: brand.text.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  statusBadgeText: {
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
    color: brand.text.secondary,
    fontSize: 13,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loaderText: {
    color: brand.text.secondary,
    fontSize: 14,
  },
  orderCard: {
    backgroundColor: brand.surface.card,
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
    color: brand.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  itemNote: {
    color: brand.text.secondary,
    fontSize: 13,
  },
  rowActions: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 14,
  },
  itemPrice: {
    color: brand.text.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  removeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyCircleButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.surface.card,
    backgroundColor: brand.background.deepCarbon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyCircleButtonPlus: {
    backgroundColor: brand.accent.primary,
    borderColor: brand.accent.primary,
  },
  qtyCircleButtonText: {
    color: brand.text.primary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  qtyCircleButtonTextPlus: {
    color: brand.text.onAccent,
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
    borderRadius: 18,
    backgroundColor: brand.accent.secondary,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  openMenuButtonText: {
    color: brand.text.onAccent,
    fontSize: 17,
    fontWeight: '800',
  },
  catalogSection: {
    display: 'none',
  },
  catalogTitle: {
    color: brand.text.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  catalogSubtitle: {
    color: brand.text.secondary,
    fontSize: 13,
  },
  catalogItemCard: {
    borderRadius: 16,
    backgroundColor: brand.surface.card,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  menuAccordionCard: {
    borderRadius: 18,
    backgroundColor: brand.background.deepCarbon,
    borderWidth: 1,
    borderColor: brand.text.metallicSoft,
    overflow: 'hidden',
  },
  menuAccordionHeader: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: brand.background.deepCarbon,
  },
  menuAccordionTitle: {
    color: brand.accent.sunset,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  menuAccordionIcon: {
    transform: [{ rotate: '0deg' }],
  },
  menuAccordionIconOpen: {
    transform: [{ rotate: '180deg' }],
  },
  menuAccordionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  catalogAddButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: brand.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  catalogAddButtonText: {
    color: brand.text.onAccent,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryLabel: {
    color: brand.text.secondary,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryValue: {
    color: brand.text.primary,
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
    backgroundColor: brand.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  syncButtonText: {
    color: brand.text.onAccent,
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
    color: brand.text.onAccent,
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
    color: brand.text.onAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: brand.overlay.scrim,
  },
  modalDismissArea: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: brand.surface.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: brand.border.subtle,
  },
  customizationCard: {
    backgroundColor: brand.surface.card,
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
    color: brand.text.primary,
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
  quantitySelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    backgroundColor: brand.background.deepCarbon,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quantityLabel: {
    color: brand.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    backgroundColor: brand.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonAccent: {
    backgroundColor: brand.accent.primary,
    borderColor: brand.accent.primary,
  },
  quantityButtonText: {
    color: brand.text.primary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  quantityButtonTextAccent: {
    color: brand.text.onAccent,
  },
  quantityValue: {
    minWidth: 28,
    textAlign: 'center',
    color: brand.text.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  quickNoteButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    backgroundColor: brand.background.deepCarbon,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickNoteText: {
    color: brand.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  customizationActionButton: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: brand.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  customizationActionText: {
    color: brand.text.onAccent,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyState: {
    paddingVertical: 18,
  },
  panelMeta: {
    marginTop: 4,
    color: brand.text.secondary,
    fontSize: 14,
  },
});