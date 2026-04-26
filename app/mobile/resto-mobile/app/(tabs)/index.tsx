import axios, { isAxiosError } from 'axios';
import { FontAwesome5 } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Fonts, type MobileBrandTheme } from '@/constants/theme';
import { useMobileAuth } from '@/lib/auth-session';
import { API_BASE_URL, SOCKET_URL } from '@/lib/api';
import { restoSocket } from '@/lib/socket';
import { useMobileTheme } from '@/src/theme/mobile-theme';

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
};

type OrderItem = {
  _id?: string;
  name: string;
  price: number;
  note: string;
};

type CurrentOrder = {
  _id?: string;
  table: string;
  cliente_nombre?: string;
  seccion: 'Sala' | 'Terraza';
  items: OrderItem[];
  total: number;
  status: 'pendiente' | 'en cocina' | 'limpieza' | 'pagado';
};

type TableDefinition = {
  table: string;
  section: 'Sala' | 'Terraza';
  capacity: number;
  highlighted?: boolean;
};

type TableStatus = {
  table: string;
  seccion: 'Sala' | 'Terraza';
  capacity: number;
  highlighted?: boolean;
  cliente_nombre?: string;
  occupied: boolean;
  orderId: string | null;
  status: 'disponible' | 'pendiente' | 'en cocina' | 'limpieza' | 'pagado';
};

type BackendMenuItem = Partial<MenuItem> & {
  nombre?: string;
  categoria?: string;
};

type BackendTableStatus = Partial<TableStatus> & {
  mesa?: string;
  ocupada?: boolean;
  order_id?: string | null;
  estado?: TableStatus['status'];
  section?: TableStatus['seccion'];
  seccion?: TableStatus['seccion'];
  cliente_nombre?: string;
  capacity?: number;
  highlighted?: boolean;
};

type DailyExchangeRateResponse = {
  ok: boolean;
  rate: number | null;
};

type GroupedMenu = Record<string, MenuItem[]>;
type ItemQuantityMap = Record<string, number>;

const LUXE_MENU_ITEMS: MenuItem[] = [
  { id: 'picoteo-los-weyes', name: 'Los Weyes', price: 10, category: 'PICOTEO' },
  { id: 'picoteo-la-limena', name: 'La Limeña', price: 14, category: 'PICOTEO' },
  { id: 'picoteo-la-acevichada', name: 'La Acevichada', price: 15, category: 'PICOTEO' },
  { id: 'picoteo-el-travieso', name: 'El Travieso', price: 17, category: 'PICOTEO' },
  { id: 'picoteo-ponja', name: 'Ponja', price: 17, category: 'PICOTEO' },
  { id: 'picoteo-moo', name: 'Moo', price: 16, category: 'PICOTEO' },
  { id: 'picoteo-ali-baba', name: 'Ali Baba', price: 8, category: 'PICOTEO' },
  { id: 'picoteo-indiscreta', name: 'Indiscreta', price: 15, category: 'PICOTEO' },
  { id: 'picoteo-caprichosos', name: 'Caprichosos', price: 6, category: 'PICOTEO' },
  { id: 'picoteo-3-chiflados', name: '3 Chiflados', price: 6, category: 'PICOTEO' },
  { id: 'picoteo-las-malcriadas', name: 'Las Malcriadas', price: 6, category: 'PICOTEO' },
  { id: 'picoteo-bonachones', name: 'Bonachones', price: 9, category: 'PICOTEO' },
  { id: 'ensaladas-pilatos', name: 'Pilatos', price: 11, category: 'ENSALADAS' },
  { id: 'ensaladas-atrevida', name: 'Atrevida', price: 13, category: 'ENSALADAS' },
  { id: 'arroces-melosito', name: 'Melosito', price: 19, category: 'ARROCES' },
  { id: 'arroces-a-lo-macho', name: 'A lo macho', price: 20, category: 'ARROCES' },
  { id: 'pastas-popeye', name: 'Popeye', price: 12, category: 'PASTAS' },
  { id: 'pastas-la-seria', name: 'La Seria', price: 12, category: 'PASTAS' },
  { id: 'sanguches-flaquita-rica', name: 'Flaquita Rica', price: 11, category: 'HAMBURGUESAS / SANGUCHES' },
  { id: 'sanguches-miss-cow', name: 'Miss Cow', price: 14, category: 'HAMBURGUESAS / SANGUCHES' },
  { id: 'sanguches-pollita', name: 'Pollita', price: 12, category: 'HAMBURGUESAS / SANGUCHES' },
  { id: 'sanguches-mr-pig', name: 'Mr Pig', price: 14, category: 'HAMBURGUESAS / SANGUCHES' },
  { id: 'sanguches-pitufina', name: 'Pitufina', price: 9.5, category: 'HAMBURGUESAS / SANGUCHES' },
  { id: 'cafe-espresso', name: 'Espresso', price: 1.5, category: 'CAFÉ' },
  { id: 'cafe-doppio', name: 'Doppio', price: 2.5, category: 'CAFÉ' },
  { id: 'cafe-cappuchino', name: 'Cappuchino', price: 2.5, category: 'CAFÉ' },
  { id: 'cafe-latte', name: 'Latte', price: 2.5, category: 'CAFÉ' },
  { id: 'cafe-mocca', name: 'Mocca', price: 3.5, category: 'CAFÉ' },
  { id: 'cafe-pitufimalteada', name: 'Pitufimalteada', price: 6, category: 'CAFÉ' },
  { id: 'cafe-oreo', name: 'Oreo', price: 7, category: 'CAFÉ' },
  { id: 'cafe-goloso', name: 'Goloso', price: 6, category: 'CAFÉ' },
  { id: 'cafe-ice-coffe', name: 'Ice Coffe', price: 3.5, category: 'CAFÉ' },
  { id: 'bebidas-frappes', name: 'Frappes', price: 4, category: 'BEBIDAS' },
  { id: 'bebidas-nestea', name: 'Nestea', price: 2, category: 'BEBIDAS' },
  { id: 'bebidas-refresco', name: 'Refresco', price: 2, category: 'BEBIDAS' },
  { id: 'bebidas-agua', name: 'Agua', price: 2, category: 'BEBIDAS' },
  { id: 'bebidas-cerveza', name: 'Cerveza', price: 1.5, category: 'BEBIDAS' },
  { id: 'cocteles-tinto-resto', name: 'Tinto Resto', price: 7, category: 'COCTELES' },
  { id: 'cocteles-peter', name: 'Peter', price: 7, category: 'COCTELES' },
  { id: 'cocteles-maria-luisa', name: 'Maria Luisa', price: 6, category: 'COCTELES' },
  { id: 'cocteles-fuera-del-resto', name: 'Fuera del Resto', price: 8, category: 'COCTELES' },
  { id: 'cocteles-candy-crush', name: 'Candy Crush', price: 6, category: 'COCTELES' },
  { id: 'cocteles-911', name: '911', price: 4, category: 'COCTELES' },
  { id: 'cocteles-mojito', name: 'Mojito', price: 5, category: 'COCTELES' },
  { id: 'cocteles-margarita', name: 'Margarita', price: 7, category: 'COCTELES' },
];

type NormalizedOrderStatus = CurrentOrder['status'];
type NormalizedTableStatus = TableStatus['status'];

const TABLE_DEFINITIONS: TableDefinition[] = [
  { table: 'Mesa 1', section: 'Sala', capacity: 4 },
  { table: 'Mesa 2', section: 'Sala', capacity: 4 },
  { table: 'Mesa 3', section: 'Sala', capacity: 4 },
  { table: 'Mesa 4', section: 'Sala', capacity: 4 },
  { table: 'Mesa 5', section: 'Sala', capacity: 4 },
  { table: 'Mesa 6', section: 'Sala', capacity: 4 },
  { table: 'Mesa 7', section: 'Sala', capacity: 8, highlighted: true },
  { table: 'Mesa 8', section: 'Terraza', capacity: 4 },
  { table: 'Mesa 9', section: 'Terraza', capacity: 4 },
  { table: 'Mesa 10', section: 'Terraza', capacity: 4 },
  { table: 'Mesa 11', section: 'Terraza', capacity: 4 },
];
const QUICK_NOTES_BY_CATEGORY: Record<string, string[]> = {
  BEBIDAS: ['Sin hielo', 'Poca azucar', 'Vaso aparte'],
  CAFÉ: ['Sin azucar', 'Leche aparte', 'Doble carga'],
  COCTELES: ['Sin alcohol', 'Menos hielo', 'Mas limon'],
  DEFAULT: ['Sin cebolla', 'Sin picante', 'Para llevar'],
};

const initialOrder: CurrentOrder = {
  table: '',
  cliente_nombre: '',
  seccion: 'Sala',
  items: [],
  total: 0,
  status: 'pendiente',
};

function MenuSectionAccordion({
  tituloCategoria,
  itemsList,
  quantityByItemKey,
  onSelectItem,
  styles,
  brand,
}: {
  tituloCategoria: string;
  itemsList: MenuItem[];
  quantityByItemKey: ItemQuantityMap;
  onSelectItem: (item: MenuItem) => void;
  styles: ReturnType<typeof createStyles>;
  brand: MobileBrandTheme;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.menuAccordionCard}>
      <Pressable onPress={() => setIsOpen((current) => !current)} style={styles.menuAccordionHeader}>
        <Text style={styles.menuAccordionTitle}>{tituloCategoria.toUpperCase()}</Text>
        <FontAwesome5
          name="chevron-down"
          size={16}
          color={isOpen ? brand.accent.sunsetOrange : brand.text.metallicLight}
          style={isOpen ? styles.menuAccordionIconOpen : styles.menuAccordionIcon}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.menuAccordionBody}>
          {itemsList.map((item) => {
            const quantity = quantityByItemKey[getMenuItemQuantityKey(item)] || 0;

            return (
              <MenuItemCard
                key={item.id}
                item={item}
                tituloCategoria={tituloCategoria}
                quantity={quantity}
                onSelectItem={onSelectItem}
                styles={styles}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function MenuItemCard({
  item,
  tituloCategoria,
  quantity,
  onSelectItem,
  styles,
}: {
  item: MenuItem;
  tituloCategoria: string;
  quantity: number;
  onSelectItem: (item: MenuItem) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={() => onSelectItem(item)}
      style={[styles.menuCard, quantity > 0 && styles.menuCardActive]}>
      {quantity > 0 ? (
        <View style={styles.menuQuantityBadge}>
          <Text style={styles.menuQuantityBadgeText}>{quantity}x</Text>
        </View>
      ) : null}
      <View style={styles.menuCopy}>
        <Text style={styles.menuName}>{item.name}</Text>
        <Text style={styles.menuCategory}>{tituloCategoria}</Text>
      </View>
      <Text style={styles.menuPrice}>${item.price.toFixed(2)}</Text>
    </Pressable>
  );
}

function getMenuItemQuantityKey(item: Pick<MenuItem, 'name' | 'price'> | Pick<OrderItem, 'name' | 'price'>) {
  return `${item.name}::${item.price}`;
}

function normalizeOrderStatus(status: unknown): NormalizedOrderStatus {
  if (status === 'limpieza' || status === 'pagado' || status === 'pendiente') {
    return status;
  }

  if (status === 'en cocina' || status === 'en_cocina') {
    return 'en cocina';
  }

  return 'pendiente';
}

function normalizeTableWorkflowStatus(status: unknown): NormalizedTableStatus {
  if (status === 'disponible' || status === 'pendiente' || status === 'limpieza' || status === 'pagado') {
    return status;
  }

  if (status === 'en cocina' || status === 'en_cocina') {
    return 'en cocina';
  }

  return 'disponible';
}

function normalizeOrder(order: CurrentOrder): CurrentOrder {
  return {
    _id: order._id,
    table: order.table,
    cliente_nombre: order.cliente_nombre || '',
    seccion: order.seccion || 'Sala',
    items: (order.items ?? []).map((item) => ({
      _id: item._id,
      name: item.name,
      price: Number(item.price ?? 0),
      note: item.note || 'Sin notas',
    })),
    total: Number(order.total ?? 0),
    status: normalizeOrderStatus(order.status),
  };
}

function normalizeMenuItem(item: BackendMenuItem, index: number): MenuItem | null {
  const name = typeof item.name === 'string' ? item.name : typeof item.nombre === 'string' ? item.nombre : '';
  const category = String(item.category || item.categoria || 'MENU').trim().toUpperCase() || 'MENU';

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

function normalizeTableStatus(table: BackendTableStatus): TableStatus | null {
  const tableName = typeof table.table === 'string' ? table.table : typeof table.mesa === 'string' ? table.mesa : '';
  const tableDefinition = TABLE_DEFINITIONS.find((item) => item.table === tableName);
  const status = normalizeTableWorkflowStatus(table.status ?? table.estado);

  if (!tableName) {
    return null;
  }

  return {
    table: tableName,
    seccion:
      table.seccion === 'Sala' || table.seccion === 'Terraza'
        ? table.seccion
        : table.section === 'Sala' || table.section === 'Terraza'
          ? table.section
          : tableDefinition?.section || 'Sala',
    capacity: typeof table.capacity === 'number' ? table.capacity : tableDefinition?.capacity || 4,
    highlighted: typeof table.highlighted === 'boolean' ? table.highlighted : Boolean(tableDefinition?.highlighted),
    cliente_nombre: typeof table.cliente_nombre === 'string' ? table.cliente_nombre : '',
    occupied: typeof table.occupied === 'boolean' ? table.occupied : Boolean(table.ocupada),
    orderId: typeof table.orderId === 'string' ? table.orderId : typeof table.order_id === 'string' ? table.order_id : null,
    status,
  };
}

function resetOrderState(
  setCurrentOrder: React.Dispatch<React.SetStateAction<CurrentOrder>>,
  setPendingItemsToAdd: React.Dispatch<React.SetStateAction<OrderItem[]>>,
  setStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>,
  setSelectedPlate: React.Dispatch<React.SetStateAction<MenuItem | null>>,
  setNote: React.Dispatch<React.SetStateAction<string>>,
  setSelectedQuantity: React.Dispatch<React.SetStateAction<number>>,
  setIsNotesModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
) {
  setCurrentOrder(initialOrder);
  setPendingItemsToAdd([]);
  setStep(1);
  setSelectedPlate(null);
  setNote('');
  setSelectedQuantity(1);
  setIsNotesModalVisible(false);
}

export default function HomeScreen() {
  const { theme: brand, isDark, toggleTheme } = useMobileTheme();
  const styles = useMemo(() => createStyles(brand), [brand]);
  const { width: windowWidth } = useWindowDimensions();
  const { session, logout } = useMobileAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    orderId?: string;
    table?: string;
    step?: string;
    paymentSuccess?: string;
    orderUpdatedSuccess?: string;
  }>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(LUXE_MENU_ITEMS);
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<CurrentOrder>(initialOrder);
  const [selectedPlate, setSelectedPlate] = useState<MenuItem | null>(null);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);
  const [note, setNote] = useState('');
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingItemsToAdd, setPendingItemsToAdd] = useState<OrderItem[]>([]);
  const [tableStatuses, setTableStatuses] = useState<TableStatus[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [activeSection, setActiveSection] = useState<'Sala' | 'Terraza'>('Sala');
  const [isReservationModalVisible, setIsReservationModalVisible] = useState(false);
  const [reservationName, setReservationName] = useState('');
  const [dailyBcvRate, setDailyBcvRate] = useState<number | null>(null);
  const [dailyPesoRate, setDailyPesoRate] = useState<number | null>(null);
  const [pendingTableSelection, setPendingTableSelection] = useState<TableDefinition | null>(null);
  const [selectedCleaningTable, setSelectedCleaningTable] = useState<TableStatus | null>(null);
  const [isCleaningModalVisible, setIsCleaningModalVisible] = useState(false);
  const [isReleasingCleaningTable, setIsReleasingCleaningTable] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(restoSocket.connected);
  const releaseGuardTablesRef = useRef<Set<string>>(new Set());

  const lockTableAsAvailable = useCallback((tables: TableStatus[], tableName: string): TableStatus[] => {
    return tables.map((table) =>
      table.table === tableName
        ? {
            ...table,
            occupied: false,
            orderId: null,
            cliente_nombre: '',
            status: 'disponible',
          }
        : table,
    );
  }, []);

  const commitIncomingTableStatuses = useCallback(
    (incomingTables: TableStatus[]) => {
      setTableStatuses((previousTables) =>
        incomingTables.map((table) => {
          if (!releaseGuardTablesRef.current.has(table.table)) {
            return table;
          }

          if (table.status === 'limpieza') {
            const previousTable = previousTables.find((item) => item.table === table.table);

            return previousTable
              ? {
                  ...table,
                  ...previousTable,
                  occupied: false,
                  orderId: null,
                  cliente_nombre: '',
                  status: 'disponible',
                }
              : {
                  ...table,
                  occupied: false,
                  orderId: null,
                  cliente_nombre: '',
                  status: 'disponible',
                };
          }

          releaseGuardTablesRef.current.delete(table.table);
          return table;
        }),
      );
    },
    [],
  );

  const groupedMenuItems = useMemo<GroupedMenu>(() => {
    return menuItems.reduce<GroupedMenu>((groups, item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }

      groups[item.category].push(item);
      return groups;
    }, {});
  }, [menuItems]);

  const tablesBySection = useMemo(() => {
    return TABLE_DEFINITIONS.filter((table) => table.section === activeSection).map((table) => {
      const status = tableStatuses.find((item) => item.table === table.table);
      return {
        ...table,
        occupied: Boolean(status?.occupied),
        orderId: status?.orderId || null,
        status: status?.status || 'disponible',
        cliente_nombre: status?.cliente_nombre || '',
      };
    });
  }, [activeSection, tableStatuses]);

  const quickNotesForSelectedItem = useMemo(() => {
    const categoryKey = String(selectedPlate?.category || 'DEFAULT').toUpperCase();
    return QUICK_NOTES_BY_CATEGORY[categoryKey] || QUICK_NOTES_BY_CATEGORY.DEFAULT;
  }, [selectedPlate]);

  const fetchMenu = useCallback(async () => {
    setIsLoadingMenu(true);

    try {
      const response = await axios.get<{ items?: BackendMenuItem[] }>(`${API_BASE_URL}/api/menu`, {
        timeout: 10000,
      });
      const normalizedItems = Array.isArray(response.data.items)
        ? response.data.items
            .map((item, index) => normalizeMenuItem(item, index))
            .filter((item): item is MenuItem => item !== null)
        : LUXE_MENU_ITEMS;

      setMenuItems(normalizedItems.length > 0 ? normalizedItems : LUXE_MENU_ITEMS);
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.message || error.message : 'Error desconocido cargando menu';

      console.log('fetchMenu error:', {
        apiBaseUrl: API_BASE_URL,
        message,
        status: isAxiosError(error) ? error.response?.status : null,
      });
      setMenuItems(LUXE_MENU_ITEMS);
      setErrorMessage(`No se pudo sincronizar el menu remoto. Mostrando menu local.`);
    } finally {
      setIsLoadingMenu(false);
    }
  }, []);

  const fetchTableStatuses = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoadingTables(true);
    }

    try {
      const response = await axios.get<{ tables?: BackendTableStatus[] }>(`${API_BASE_URL}/api/tables/status`, {
        timeout: 10000,
      });
      const normalizedTables = Array.isArray(response.data.tables)
        ? response.data.tables
            .map((table) => normalizeTableStatus(table))
            .filter((table): table is TableStatus => table !== null)
        : [];

      commitIncomingTableStatuses(normalizedTables);
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.message || error.message : 'Error desconocido cargando mesas';

      console.log('fetchTableStatuses error:', {
        apiBaseUrl: API_BASE_URL,
        message,
        status: isAxiosError(error) ? error.response?.status : null,
      });
      Alert.alert('Error cargando mesas', message);
      setErrorMessage(`No se pudo cargar el estado de las mesas. ${message}`);
    } finally {
      if (showLoader) {
        setIsLoadingTables(false);
      }
    }
  }, [commitIncomingTableStatuses]);

  const fetchBcvRate = useCallback(async () => {
    try {
      const response = await axios.get<DailyExchangeRateResponse>(`${API_BASE_URL}/api/exchange-rate/today?type=bcv`, {
        timeout: 10000,
      });

      const rate = Number(response.data.rate);
      setDailyBcvRate(Number.isFinite(rate) && rate > 0 ? rate : null);
    } catch {
      setDailyBcvRate(null);
    }
  }, []);

  const fetchPesoRate = useCallback(async () => {
    try {
      const response = await axios.get<DailyExchangeRateResponse>(`${API_BASE_URL}/api/exchange-rate/today?type=pesos`, {
        timeout: 10000,
      });

      const rate = Number(response.data.rate);
      setDailyPesoRate(Number.isFinite(rate) && rate > 0 ? rate : null);
    } catch {
      setDailyPesoRate(null);
    }
  }, []);

  useEffect(() => {
    void fetchMenu();
    void fetchTableStatuses(true);
    void fetchBcvRate();
    void fetchPesoRate();

    const intervalId = setInterval(() => {
      void fetchTableStatuses(false);
    }, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchBcvRate, fetchMenu, fetchPesoRate, fetchTableStatuses]);

  useEffect(() => {
    setIsSocketConnected(restoSocket.connected);

    const handleSocketConnect = () => {
      setIsSocketConnected(true);
    };

    const handleSocketDisconnect = () => {
      setIsSocketConnected(false);
    };

    const handleSocketConnectError = (error: Error) => {
      setIsSocketConnected(false);
      setErrorMessage(
        `No se pudo enlazar el socket con ${SOCKET_URL}. Verifica la IP privada del backend y que el puerto 5000 este accesible. ${error.message}`,
      );
    };

    if (!restoSocket.connected) {
      restoSocket.connect();
    }

    const handleOrderUpdated = () => {
      void fetchTableStatuses(false);
    };

    const handleTableReleased = () => {
      void fetchTableStatuses(false);
    };

    const handleTableOccupied = () => {
      void fetchTableStatuses(false);
    };

    const handleTableCleaning = () => {
      void fetchTableStatuses(false);
    };

    const handleTableUpdated = () => {
      void fetchTableStatuses(false);
    };

    const handleRateUpdated = (payload?: { rateType?: string }) => {
      if (payload?.rateType === 'pesos') {
        void fetchPesoRate();
        return;
      }

      if (payload?.rateType === 'bcv') {
        void fetchBcvRate();
        return;
      }

      void fetchBcvRate();
      void fetchPesoRate();
    };

    restoSocket.on('connect', handleSocketConnect);
    restoSocket.on('disconnect', handleSocketDisconnect);
    restoSocket.on('connect_error', handleSocketConnectError);
    restoSocket.on('orden_actualizada', handleOrderUpdated);
    restoSocket.on('CAMBIO_ESTADO_MESA', handleTableUpdated);
    restoSocket.on('mesa_liberada', handleTableReleased);
    restoSocket.on('mesa_ocupada', handleTableOccupied);
    restoSocket.on('mesa_en_limpieza', handleTableCleaning);
    restoSocket.on('mesa_actualizada', handleTableUpdated);
    restoSocket.on('tasa_actualizada', handleRateUpdated);

    return () => {
      restoSocket.off('connect', handleSocketConnect);
      restoSocket.off('disconnect', handleSocketDisconnect);
      restoSocket.off('connect_error', handleSocketConnectError);
      restoSocket.off('orden_actualizada', handleOrderUpdated);
      restoSocket.off('CAMBIO_ESTADO_MESA', handleTableUpdated);
      restoSocket.off('mesa_liberada', handleTableReleased);
      restoSocket.off('mesa_ocupada', handleTableOccupied);
      restoSocket.off('mesa_en_limpieza', handleTableCleaning);
      restoSocket.off('mesa_actualizada', handleTableUpdated);
      restoSocket.off('tasa_actualizada', handleRateUpdated);
    };
  }, [fetchBcvRate, fetchPesoRate, fetchTableStatuses]);

  useEffect(() => {
    const feedbackMessage = params.paymentSuccess || params.orderUpdatedSuccess;

    if (!feedbackMessage) {
      return;
    }

    setCurrentOrder(initialOrder);
    setPendingItemsToAdd([]);
    setStep(1);
    setErrorMessage('');
    setSuccessMessage(feedbackMessage);
  }, [params.orderUpdatedSuccess, params.paymentSuccess]);

  const pendingItemsTotal = useMemo(
    () => pendingItemsToAdd.reduce((sum, item) => sum + item.price, 0),
    [pendingItemsToAdd],
  );
  const combinedOrderItems = useMemo(
    () => (currentOrder._id ? [...currentOrder.items, ...pendingItemsToAdd] : currentOrder.items),
    [currentOrder._id, currentOrder.items, pendingItemsToAdd],
  );
  const groupedCombinedOrderItems = useMemo(() => {
    const grouped = new Map<string, { item: OrderItem; quantity: number; firstIndex: number }>();

    combinedOrderItems.forEach((item, index) => {
      const note = item.note || 'Sin notas';
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
  }, [combinedOrderItems]);

  const shouldStackItemControls = windowWidth <= 390;
  const displayedTotal = useMemo(
    () => (currentOrder._id ? currentOrder.total + pendingItemsTotal : currentOrder.total),
    [currentOrder._id, currentOrder.total, pendingItemsTotal],
  );
  const quantityByItemKey = useMemo<ItemQuantityMap>(() => {
    return combinedOrderItems.reduce<ItemQuantityMap>((accumulator, item) => {
      const key = getMenuItemQuantityKey(item);
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
  }, [combinedOrderItems]);
  const displayedTotalInBs = useMemo(
    () => (dailyBcvRate ? displayedTotal * dailyBcvRate : null),
    [dailyBcvRate, displayedTotal],
  );
  const displayedTotalInPesos = useMemo(
    () => (dailyPesoRate ? displayedTotal * dailyPesoRate : null),
    [dailyPesoRate, displayedTotal],
  );
  const totalItems = useMemo(() => combinedOrderItems.length, [combinedOrderItems]);
  const canRemoveItems = !currentOrder._id || currentOrder.status === 'pendiente';
  const canAddItemsToOrder = currentOrder.status !== 'pagado' && currentOrder.status !== 'limpieza';
  const bottomBarGlowAnim = useRef(new Animated.Value(0)).current;
  const itemsPopAnim = useRef(new Animated.Value(1)).current;
  const hasAnimatedTotalRef = useRef(false);
  const hasAnimatedItemsRef = useRef(false);
  const glowOpacity = bottomBarGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.55],
  });
  const glowTranslateY = bottomBarGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  useEffect(() => {
    if (!hasAnimatedTotalRef.current) {
      hasAnimatedTotalRef.current = true;
      return;
    }

    bottomBarGlowAnim.setValue(0);
    Animated.sequence([
      Animated.timing(bottomBarGlowAnim, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bottomBarGlowAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [bottomBarGlowAnim, displayedTotal]);

  useEffect(() => {
    if (!hasAnimatedItemsRef.current) {
      hasAnimatedItemsRef.current = true;
      return;
    }

    itemsPopAnim.setValue(1);
    Animated.sequence([
      Animated.timing(itemsPopAnim, {
        toValue: 1.08,
        duration: 110,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(itemsPopAnim, {
        toValue: 1,
        duration: 140,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [itemsPopAnim, totalItems]);

  useEffect(() => {
    if (!selectedCleaningTable) {
      setIsCleaningModalVisible(false);
      return;
    }

    const nextSelectedCleaningTable = tableStatuses.find((item) => item.table === selectedCleaningTable.table && item.status === 'limpieza') || null;
    setSelectedCleaningTable(nextSelectedCleaningTable);

    if (!nextSelectedCleaningTable) {
      setIsCleaningModalVisible(false);
    }
  }, [selectedCleaningTable, tableStatuses]);

  useEffect(() => {
    const incomingOrderId = params.orderId;
    const requestedStep = params.step;

    if (requestedStep === '2') {
      setStep(2);
    }

    if (!incomingOrderId || incomingOrderId === currentOrder._id) {
      return;
    }

    const syncIncomingOrder = async () => {
      try {
        const response = await axios.get<{ order: CurrentOrder }>(`${API_BASE_URL}/api/orders/${incomingOrderId}`);
        setCurrentOrder(normalizeOrder(response.data.order));
        setPendingItemsToAdd([]);
      } catch {
        setErrorMessage('No se pudo cargar la orden activa seleccionada.');
      }
    };

    syncIncomingOrder();
  }, [currentOrder._id, params.orderId, params.step]);

  const handleCloseCleaningModal = useCallback(() => {
    setIsCleaningModalVisible(false);
    setSelectedCleaningTable(null);
  }, []);

  const handleTablePress = async (tableDefinition: TableDefinition) => {
    setSuccessMessage('');
    setErrorMessage('');

    const tableStatus = tableStatuses.find((item) => item.table === tableDefinition.table);

    if (tableStatus?.status === 'limpieza') {
      setSelectedCleaningTable(tableStatus);
      setIsCleaningModalVisible(true);
      return;
    }

    handleCloseCleaningModal();

    if (tableStatus?.occupied && tableStatus.orderId) {
      router.push({
        pathname: '/active-order',
        params: {
          table: tableDefinition.table,
          orderId: tableStatus.orderId,
        },
      });
      return;
    }

    setPendingTableSelection(tableDefinition);
    setReservationName('');
    setIsReservationModalVisible(true);
  };

  const handleConfirmReservation = () => {
    if (!pendingTableSelection) {
      return;
    }

    setCurrentOrder({
      ...initialOrder,
      table: pendingTableSelection.table,
      seccion: pendingTableSelection.section,
      cliente_nombre: reservationName.trim(),
    });
    setPendingItemsToAdd([]);
    setSelectedCleaningTable(null);
    setIsReservationModalVisible(false);
    setPendingTableSelection(null);
    setReservationName('');
    setStep(2);
  };

  const handleReleaseCleaningTable = useCallback(async () => {
    if (!selectedCleaningTable) {
      return;
    }

    const tableName = selectedCleaningTable.table;

    releaseGuardTablesRef.current.add(tableName);
    setIsCleaningModalVisible(false);
    setSelectedCleaningTable(null);
    setTableStatuses((previousTables) => lockTableAsAvailable(previousTables, tableName));

    try {
      setIsReleasingCleaningTable(true);
      setErrorMessage('');
      setSuccessMessage(`${tableName} liberandose...`);

      const response = await axios.patch<{ message: string }>(
        `${API_BASE_URL}/api/tables/${encodeURIComponent(tableName)}/liberar`,
      );

      setSuccessMessage(response.data.message || `${tableName} quedo libre.`);
      await fetchTableStatuses(false);
    } catch (error) {
      releaseGuardTablesRef.current.delete(tableName);
      setTableStatuses((previousTables) =>
        previousTables.map((table) =>
          table.table === tableName
            ? {
                ...table,
                occupied: true,
                status: 'limpieza',
              }
            : table,
        ),
      );
      const retryMessage = 'Error al liberar, reintentando...';

      if (isAxiosError(error)) {
        setErrorMessage(retryMessage);
      } else {
        setErrorMessage(retryMessage);
      }

      const revertedTable = tableStatuses.find((item) => item.table === tableName);
      if (revertedTable) {
        setSelectedCleaningTable({
          ...revertedTable,
          occupied: true,
          status: 'limpieza',
        });
        setIsCleaningModalVisible(true);
      }

      await fetchTableStatuses(false);
    } finally {
      setIsReleasingCleaningTable(false);
    }
  }, [fetchTableStatuses, lockTableAsAvailable, selectedCleaningTable, tableStatuses]);

  const addToOrder = useCallback((item: MenuItem) => {
    if (!canAddItemsToOrder) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const nextItem: OrderItem = {
      name: item.name,
      price: item.price,
      note: 'Sin notas',
    };

    if (currentOrder._id) {
      setPendingItemsToAdd((previous) => [...previous, nextItem]);
      setSuccessMessage(`${item.name} agregado para actualizar el pedido.`);
      return;
    }

    const nextItems = [...currentOrder.items, nextItem];
    const total = nextItems.reduce((sum, candidate) => sum + candidate.price, 0);

    setCurrentOrder({
      table: currentOrder.table,
      cliente_nombre: currentOrder.cliente_nombre,
      seccion: currentOrder.seccion,
      items: nextItems,
      total,
      status: 'pendiente',
    });

    setSuccessMessage(`${item.name} agregado al pedido.`);
  }, [canAddItemsToOrder, currentOrder, setPendingItemsToAdd]);

  const handleAddItem = async () => {
    if (!selectedPlate) {
      return;
    }

    const itemNote = note.trim() || 'Sin notas';
    const quantity = Number.isFinite(selectedQuantity) ? Math.max(1, Math.trunc(selectedQuantity)) : 1;
    const itemsBatch = Array.from({ length: quantity }, () => ({
      name: selectedPlate.name,
      price: selectedPlate.price,
      note: itemNote,
    }));

    if (currentOrder._id) {
      setPendingItemsToAdd((previous) => [
        ...previous,
        ...itemsBatch,
      ]);
      setSuccessMessage(`${selectedPlate.name} x${quantity} listo para actualizar el pedido.`);
      setIsNotesModalVisible(false);
      setSelectedPlate(null);
      setNote('');
      setSelectedQuantity(1);
      setStep(2);
      return;
    }

    const nextItems = [
      ...currentOrder.items,
      ...itemsBatch,
    ];

    const total = nextItems.reduce((sum, item) => sum + item.price, 0);

    setCurrentOrder({
      table: currentOrder.table,
      cliente_nombre: currentOrder.cliente_nombre,
      seccion: currentOrder.seccion,
      items: nextItems,
      total,
      status: 'pendiente',
    });
    setIsNotesModalVisible(false);
    setSelectedPlate(null);
    setNote('');
    setSelectedQuantity(1);
    setStep(2);
  };

  const handleRemoveItem = (indexToRemove: number, shouldConfirm = true) => {
    const itemToRemove = combinedOrderItems[indexToRemove];
    const baseItemsCount = currentOrder.items.length;

    if (!itemToRemove) {
      return;
    }

    if (currentOrder._id && indexToRemove >= baseItemsCount) {
      setPendingItemsToAdd((previous) => previous.filter((_, index) => index !== indexToRemove - baseItemsCount));
      setSuccessMessage(`${itemToRemove.name} fue quitado de la actualización.`);
      return;
    }

    if (!canRemoveItems) {
      Alert.alert('No permitido', 'No puedes eliminar items cuando la orden ya no esta pendiente.');
      return;
    }

    const executeRemoval = async () => {
      if (currentOrder._id && itemToRemove._id) {
        try {
          const response = await axios.patch<{ order: CurrentOrder }>(`${API_BASE_URL}/api/orders/${currentOrder._id}/update-items`, {
            items: currentOrder.items.filter((item) => item._id !== itemToRemove._id),
          },
          );

          setCurrentOrder(normalizeOrder(response.data.order));
          setSuccessMessage(`${itemToRemove.name} fue eliminado de la orden.`);
          return;
        } catch (error) {
          if (isAxiosError(error)) {
            setErrorMessage(error.response?.data?.message || 'No se pudo eliminar el item.');
            return;
          }

          setErrorMessage('No se pudo eliminar el item.');
          return;
        }
      }

      const nextItems = currentOrder.items.filter((_, index) => index !== indexToRemove);
      const total = nextItems.reduce((sum, item) => sum + item.price, 0);

      setCurrentOrder({
        table: currentOrder.table,
        cliente_nombre: currentOrder.cliente_nombre,
        seccion: currentOrder.seccion,
        items: nextItems,
        total,
        status: 'pendiente',
      });
    };

    if (!shouldConfirm) {
      void executeRemoval();
      return;
    }

    Alert.alert(
      'Eliminar producto',
      `Vas a eliminar ${itemToRemove.name} del pedido actual.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void executeRemoval();
          },
        },
      ],
    );
  };

  const handleCloseModal = () => {
    setIsNotesModalVisible(false);
    setSelectedPlate(null);
    setNote('');
    setSelectedQuantity(1);
    setStep(2);
  };

  const handleAddFromGroup = (item: OrderItem) => {
    if (!canAddItemsToOrder) {
      return;
    }

    if (currentOrder._id) {
      setPendingItemsToAdd((previous) => [
        ...previous,
        {
          name: item.name,
          price: item.price,
          note: item.note,
        },
      ]);
      setSuccessMessage(`${item.name} agregado para actualizar el pedido.`);
      return;
    }

    const nextItems = [...currentOrder.items, { name: item.name, price: item.price, note: item.note }];
    const total = nextItems.reduce((sum, candidate) => sum + candidate.price, 0);

    setCurrentOrder({
      table: currentOrder.table,
      cliente_nombre: currentOrder.cliente_nombre,
      seccion: currentOrder.seccion,
      items: nextItems,
      total,
      status: 'pendiente',
    });
    setSuccessMessage(`${item.name} agregado al pedido.`);
  };

  const handleSubmitOrder = async () => {
    if (!currentOrder.table || (!currentOrder._id && currentOrder.items.length === 0)) {
      setErrorMessage('Selecciona una mesa y agrega al menos un plato antes de confirmar.');
      return;
    }

    if (currentOrder._id && pendingItemsToAdd.length === 0) {
      setErrorMessage('Agrega al menos un producto antes de actualizar el pedido.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
    const payload = {
      tableId: currentOrder.table,
      cliente_nombre: currentOrder.cliente_nombre,
      seccion: currentOrder.seccion,
      items: currentOrder._id ? pendingItemsToAdd : currentOrder.items,
    };

      const response = await axios.post<{ order: CurrentOrder }>(`${API_BASE_URL}/api/orders`, payload);
      const normalizedOrder = normalizeOrder(response.data.order);
      console.log('Pedido emitido:', response.data.order);

      setCurrentOrder(normalizedOrder);

      const successCopy = '¡Pedido procesado con éxito!';

      if (currentOrder._id) {
        resetOrderState(
          setCurrentOrder,
          setPendingItemsToAdd,
          setStep,
          setSelectedPlate,
          setNote,
          setSelectedQuantity,
          setIsNotesModalVisible,
        );
        Alert.alert('Pedido actualizado', successCopy);
        router.replace({
          pathname: '/(tabs)',
          params: {
            orderUpdatedSuccess: successCopy,
          },
        });
        return;
      }

      resetOrderState(
        setCurrentOrder,
        setPendingItemsToAdd,
        setStep,
        setSelectedPlate,
        setNote,
        setSelectedQuantity,
        setIsNotesModalVisible,
      );
      Alert.alert('Pedido enviado', successCopy);
      router.replace({
        pathname: '/(tabs)',
        params: {
          orderUpdatedSuccess: successCopy,
        },
      });

      try {
        const tablesResponse = await axios.get<{ tables: TableStatus[] }>(`${API_BASE_URL}/api/tables/status`);
        setTableStatuses(tablesResponse.data.tables ?? []);
      } catch {
        // noop
      }
    } catch (error) {
      if (isAxiosError(error)) {
        const activeOrderId = error.response?.data?.order?._id;
        const backendMessage = error.response?.data?.message;

        if (backendMessage === 'La mesa ya tiene un pedido activo' && activeOrderId) {
          setErrorMessage(backendMessage);
          router.push({
            pathname: '/active-order',
            params: {
              table: currentOrder.table,
              orderId: activeOrderId,
            },
          });
          return;
        }

        setErrorMessage(backendMessage || 'No se pudo enviar el pedido al backend. Revisa tu IP local y el puerto 5000.');
        return;
      }

      setErrorMessage('No se pudo enviar el pedido al backend. Revisa tu IP local y el puerto 5000.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.overline}>Resto 001</Text>
            <View style={styles.heroActionsRow}>
              <Pressable style={styles.themeTogglePill} onPress={toggleTheme}>
                <FontAwesome5 name={isDark ? 'sun' : 'moon'} size={12} color={brand.text.primary} />
                <Text style={styles.themeToggleText}>{isDark ? 'Claro' : 'Oscuro'}</Text>
              </Pressable>
              {session?.usuario ? (
                <Pressable style={styles.sessionPill} onPress={logout}>
                  <Text style={styles.sessionPillText}>{session.usuario} (salir)</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={styles.title}>Mesonero movil</Text>
          <View style={styles.connectionBadge}>
            <FontAwesome5
              name={isSocketConnected ? 'link' : 'unlink'}
              size={12}
              color={isSocketConnected ? brand.status.success : brand.status.warning}
            />
            <Text style={styles.connectionText}>{isSocketConnected ? 'Enlazado con caja' : 'Conectando con caja'}</Text>
          </View>
        </View>

        <View style={styles.stepsRow}>
          {[1, 2, 3].map((stepNumber) => {
            const active = step === stepNumber;

            return (
              <View key={stepNumber} style={[styles.stepPill, active && styles.stepPillActive]}>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>Paso {stepNumber}</Text>
              </View>
            );
          })}
        </View>

        {step === 1 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>1. Selección de mesa</Text>
            <Text style={styles.sectionText}>Organiza el salón por zonas y aparta una mesa con nombre opcional antes de cargar productos.</Text>

            <View style={styles.sectionTabs}>
              {[
                { key: 'Sala', label: 'SALA PRINCIPAL' },
                { key: 'Terraza', label: 'TERRAZA' },
              ].map((section) => {
                const selected = activeSection === section.key;

                return (
                  <Pressable
                    key={section.key}
                    onPress={() => setActiveSection(section.key as 'Sala' | 'Terraza')}
                    style={[styles.sectionTab, selected && styles.sectionTabActive]}>
                    <Text style={[styles.sectionTabText, selected && styles.sectionTabTextActive]}>{section.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {isLoadingTables ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color={brand.accent.sunsetOrange} />
                <Text style={styles.loaderText}>Consultando estado de mesas...</Text>
              </View>
            ) : null}

            <View style={styles.tableGrid}>
              {tablesBySection.map((table) => {
                const selected = currentOrder.table === table.table;
                const occupied = Boolean(table.occupied);
                const isCleaning = table.status === 'limpieza';
                const isPendingPayment = table.status === 'pendiente';
                const statusLabel = isCleaning ? 'Limpieza' : isPendingPayment ? 'Pendiente pago' : occupied ? 'Ocupada' : 'Disponible';

                return (
                  <Pressable
                    key={table.table}
                    onPress={() => handleTablePress(table)}
                    style={[
                      styles.giantButton,
                      table.highlighted && styles.giantButtonLarge,
                      isCleaning
                        ? styles.giantButtonCleaning
                        : isPendingPayment
                          ? styles.giantButtonPendingPayment
                          : occupied && styles.giantButtonOccupied,
                      selected && !occupied && !isCleaning && styles.giantButtonSelected,
                    ]}>
                    <View style={styles.tableButtonHeader}>
                      <Text style={[styles.tableStatusBadge, (occupied || isCleaning) && styles.tableStatusBadgeOccupied]}>
                        {statusLabel}
                      </Text>
                      {occupied ? <FontAwesome5 name={isCleaning ? 'broom' : isPendingPayment ? 'money-bill-wave' : 'user-alt'} size={16} color={brand.text.contrastOnAccent} /> : null}
                    </View>
                    <Text style={[styles.giantButtonLabel, (occupied || isCleaning) && styles.giantButtonLabelOccupied]}>
                      {table.table}
                    </Text>
                    <Text style={[styles.giantButtonMeta, (occupied || isCleaning) && styles.giantButtonMetaOccupied]}>
                      {isCleaning
                        ? 'Cuenta cobrada. Esperando liberacion manual.'
                        : isPendingPayment
                          ? 'Comanda impresa. Falta pago en caja.'
                        : occupied
                          ? table.cliente_nombre || 'Cliente sin nombre'
                        : `${table.capacity} personas${table.highlighted ? ' · mesa destacada' : ''}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionTitle}>2. Menu de bebidas y platos</Text>
                <Text style={styles.sectionText}>Toca cualquier item para sumarlo al pedido en el instante.</Text>
              </View>
              <Pressable onPress={() => setStep(1)} style={[styles.secondaryChip, styles.secondaryChipMenuBack]}>
                <Text style={styles.secondaryChipText}>Cambiar mesa</Text>
              </Pressable>
            </View>

            {isLoadingMenu ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color={brand.accent.sunsetOrange} />
                <Text style={styles.loaderText}>Cargando platos...</Text>
              </View>
            ) : (
              <View style={styles.menuList}>
                {Object.keys(groupedMenuItems).map((category) => (
                  <MenuSectionAccordion
                    key={category}
                    tituloCategoria={category}
                    itemsList={groupedMenuItems[category] ?? []}
                    quantityByItemKey={quantityByItemKey}
                    onSelectItem={addToOrder}
                    styles={styles}
                    brand={brand}
                  />
                ))}
              </View>
            )}

            <Animated.View style={styles.orderCard}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.bottomBarGlow,
                  {
                    opacity: glowOpacity,
                    transform: [{ translateY: glowTranslateY }],
                  },
                ]}
              />
              <Text style={styles.orderTitle}>Pedido actual</Text>
              <Text style={styles.orderMeta}>{currentOrder.table || 'Mesa pendiente'}</Text>
              <Text style={styles.orderMeta}>{currentOrder.seccion || 'Sala'}</Text>
              {currentOrder.cliente_nombre ? <Text style={styles.orderMeta}>Reserva: {currentOrder.cliente_nombre}</Text> : null}
              <Animated.Text style={[styles.orderMeta, styles.orderMetaCount, { transform: [{ scale: itemsPopAnim }] }]}> 
                {totalItems} platos agregados
              </Animated.Text>

              {currentOrder._id && canAddItemsToOrder ? (
                <Pressable onPress={() => setStep(2)} style={styles.addMoreButton}>
                  <Text style={styles.addMoreButtonText}>Agregar mas platos</Text>
                </Pressable>
              ) : null}

              {currentOrder._id ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/active-order',
                      params: {
                        table: currentOrder.table,
                        orderId: currentOrder._id,
                      },
                    })
                  }
                  style={styles.viewActiveOrderButton}>
                  <Text style={styles.viewActiveOrderButtonText}>Ver pedido activo</Text>
                </Pressable>
              ) : null}

              {groupedCombinedOrderItems.map((group) => (
                <View key={`${group.item.name}-${group.item.note}-${group.item.price}`} style={styles.orderItemRow}>
                  <View style={styles.orderItemCopy}>
                    <View style={styles.orderItemHeader}>
                      <Text style={styles.orderItemName}>{group.quantity} x {group.item.name}</Text>
                      <View style={[styles.itemQtyControls, shouldStackItemControls && styles.itemQtyControlsStacked]}>
                        <Pressable
                          onPress={() => handleRemoveItem(group.firstIndex, group.quantity === 1)}
                          disabled={!canRemoveItems || group.quantity <= 0}
                          style={[styles.qtyCircleButton, (!canRemoveItems || group.quantity <= 0) && styles.disabledAction]}>
                          <Text style={styles.qtyCircleButtonText}>-</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleAddFromGroup(group.item)}
                          disabled={!canAddItemsToOrder}
                          style={[styles.qtyCircleButton, styles.qtyCircleButtonPlus, !canAddItemsToOrder && styles.disabledAction]}>
                          <Text style={[styles.qtyCircleButtonText, styles.qtyCircleButtonTextPlus]}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.orderItemNote}>{group.item.note}</Text>
                  </View>
                  <Text style={styles.orderItemPrice}>${(group.item.price * group.quantity).toFixed(2)}</Text>
                </View>
              ))}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <View style={styles.totalValueStack}>
                  <Text style={styles.totalValue}>${displayedTotal.toFixed(2)}</Text>
                  {displayedTotalInBs ? <Text style={styles.totalValueBs}>Bs {displayedTotalInBs.toFixed(2)}</Text> : null}
                  {displayedTotalInPesos ? <Text style={styles.totalValueBs}>Pesos {displayedTotalInPesos.toFixed(2)}</Text> : null}
                </View>
              </View>

              <Pressable
                onPress={handleSubmitOrder}
                disabled={
                  isSubmitting ||
                  (!currentOrder._id && currentOrder.items.length === 0) ||
                  (Boolean(currentOrder._id) && pendingItemsToAdd.length === 0)
                }
                style={[
                  styles.primaryAction,
                  (
                    isSubmitting ||
                    (!currentOrder._id && currentOrder.items.length === 0) ||
                    (Boolean(currentOrder._id) && pendingItemsToAdd.length === 0)
                  ) && styles.disabledAction,
                ]}>
                <Text style={styles.primaryActionText}>
                  {isSubmitting ? 'Enviando pedido...' : currentOrder._id ? 'Actualizar Pedido' : 'Confirmar'}
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={isCleaningModalVisible}
        onRequestClose={handleCloseCleaningModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mesa en Limpieza</Text>
            <Text style={styles.modalSubtitle}>{selectedCleaningTable?.table ?? 'Mesa seleccionada'}</Text>
            <Text style={styles.modalHelper}>
              La caja ya registro el cobro. Si el equipo termino de limpiarla, puedes liberarla ahora mismo.
            </Text>

            <View style={styles.modalActionsColumn}>
              <Pressable
                onPress={() => void handleReleaseCleaningTable()}
                disabled={isReleasingCleaningTable}
                style={[styles.modalPrimaryAction, isReleasingCleaningTable && styles.disabledAction]}>
                <Text style={styles.modalPrimaryText}>
                  {isReleasingCleaningTable ? 'Liberando mesa...' : 'Mesa Limpia / Liberar Mesa'}
                </Text>
              </Pressable>

              <Pressable onPress={handleCloseCleaningModal} style={styles.modalSecondaryAction}>
                <Text style={styles.modalSecondaryText}>Cerrar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isReservationModalVisible}
        onRequestClose={() => {
          setIsReservationModalVisible(false);
          setPendingTableSelection(null);
          setReservationName('');
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reserva de mesa</Text>
            <Text style={styles.modalSubtitle}>{pendingTableSelection?.table ?? 'Mesa seleccionada'}</Text>
            <Text style={styles.modalHelper}>¿Nombre para la reserva? (Opcional)</Text>

            <TextInput
              value={reservationName}
              onChangeText={setReservationName}
              placeholder="Ej: Prato"
              placeholderTextColor={brand.text.metallicSoft}
              style={styles.notesInput}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setIsReservationModalVisible(false);
                  setPendingTableSelection(null);
                  setReservationName('');
                }}
                style={styles.modalSecondaryAction}>
                <Text style={styles.modalSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={handleConfirmReservation} style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>Continuar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={isNotesModalVisible}
        onRequestClose={handleCloseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>3. Nota para cocina</Text>
            <Text style={styles.modalSubtitle}>{selectedPlate?.name ?? 'Plato seleccionado'}</Text>
            <Text style={styles.modalHelper}>
              Este paso agrega el item al pedido. El envio al backend sucede cuando pulsas Confirmar en Pedido actual.
            </Text>

            <View style={styles.quantityRow}>
              <Text style={styles.quantityLabel}>Cantidad</Text>
              <View style={styles.quantityControls}>
                <Pressable
                  onPress={() => setSelectedQuantity((current) => Math.max(1, current - 1))}
                  style={styles.quantityButton}>
                  <Text style={styles.quantityButtonText}>-</Text>
                </Pressable>
                <Text style={styles.quantityValue}>{selectedQuantity}</Text>
                <Pressable
                  onPress={() => setSelectedQuantity((current) => current + 1)}
                  style={[styles.quantityButton, styles.quantityButtonAccent]}>
                  <Text style={[styles.quantityButtonText, styles.quantityButtonTextAccent]}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.quickNotesRow}>
              {quickNotesForSelectedItem.map((quickNote) => {
                const selected = note === quickNote;

                return (
                  <Pressable
                    key={quickNote}
                    onPress={() => setNote(quickNote)}
                    style={[styles.quickNoteChip, selected && styles.quickNoteChipActive]}>
                    <Text style={[styles.quickNoteText, selected && styles.quickNoteTextActive]}>
                      {quickNote}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Escribe una nota para cocina"
              placeholderTextColor={brand.text.metallicSoft}
              multiline
              style={styles.notesInput}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={handleCloseModal} style={styles.modalSecondaryAction}>
                <Text style={styles.modalSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={handleAddItem} style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>Agregar x{selectedQuantity}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (brand: MobileBrandTheme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    padding: 20,
    gap: 18,
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: brand.surface.card,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  heroActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  overline: {
    color: brand.accent.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  themeTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: brand.background.deepCarbon,
  },
  themeToggleText: {
    color: brand.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  sessionPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: brand.background.deepCarbon,
  },
  sessionPillText: {
    color: brand.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    marginTop: 12,
    color: brand.text.primary,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    fontFamily: Fonts?.serif,
  },
  connectionBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: brand.background.deepCarbon,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
  },
  connectionText: {
    color: brand.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  stepsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepPill: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    backgroundColor: brand.surface.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
  },
  stepPillActive: {
    backgroundColor: brand.accent.primary,
    borderColor: brand.accent.primary,
  },
  stepLabel: {
    textAlign: 'center',
    color: brand.text.primary,
    fontWeight: '700',
  },
  stepLabelActive: {
    color: brand.text.onAccent,
  },
  sectionCard: {
    borderRadius: 28,
    backgroundColor: brand.surface.card,
    padding: 18,
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sectionHeaderRow: {
    gap: 14,
  },
  sectionHeaderCopy: {
    maxWidth: '100%',
  },
  sectionTitle: {
    color: brand.text.primary,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: Fonts?.serif,
  },
  sectionText: {
    marginTop: 4,
    color: brand.text.secondary,
    fontSize: 14,
  },
  sectionTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionTab: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    backgroundColor: brand.surface.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sectionTabActive: {
    borderColor: brand.accent.primary,
    backgroundColor: brand.accent.primary,
  },
  sectionTabText: {
    color: brand.text.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionTabTextActive: {
    color: brand.text.onAccent,
  },
  tableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  giantButton: {
    width: '48%',
    minHeight: 118,
    borderRadius: 16,
    backgroundColor: brand.surface.card,
    borderWidth: 1,
    borderColor: brand.border.subtle,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
  },
  giantButtonLarge: {
    width: '100%',
    minHeight: 154,
  },
  giantButtonOccupied: {
    backgroundColor: brand.accent.primary,
    borderColor: brand.accent.primary,
  },
  giantButtonCleaning: {
    backgroundColor: brand.status.warning,
    borderColor: brand.status.warning,
  },
  giantButtonPendingPayment: {
    backgroundColor: brand.status.success,
    borderColor: brand.status.success,
  },
  giantButtonSelected: {
    borderColor: brand.accent.primary,
  },
  tableButtonHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableStatusBadge: {
    color: brand.text.secondary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  tableStatusBadgeOccupied: {
    color: brand.text.onAccent,
  },
  giantButtonLabel: {
    color: brand.text.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  giantButtonLabelOccupied: {
    color: brand.text.onAccent,
  },
  giantButtonMeta: {
    color: brand.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  giantButtonMetaOccupied: {
    color: brand.text.onAccent,
  },
  primaryAction: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: brand.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  disabledAction: {
    backgroundColor: brand.border.subtle,
  },
  primaryActionText: {
    color: brand.text.onAccent,
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryChip: {
    borderRadius: 12,
    backgroundColor: brand.background.deepCarbon,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
  },
  secondaryChipMenuBack: {
    alignSelf: 'flex-start',
  },
  secondaryChipText: {
    color: brand.text.primary,
    fontWeight: '700',
  },
  loaderWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: brand.text.primary,
    fontSize: 15,
  },
  menuList: {
    gap: 12,
  },
  menuAccordionCard: {
    borderRadius: 20,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    overflow: 'hidden',
  },
  menuAccordionHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0A0A0A',
  },
  menuAccordionTitle: {
    color: '#BF953F',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: Fonts?.serif,
  },
  menuAccordionIcon: {
    transform: [{ rotate: '0deg' }],
  },
  menuAccordionIconOpen: {
    transform: [{ rotate: '180deg' }],
  },
  menuAccordionBody: {
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  menuSection: {
    gap: 10,
  },
  menuSectionTitle: {
    color: brand.accent.primary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  menuCard: {
    minHeight: 86,
    borderRadius: 16,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#1A1A1A',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  menuCardActive: {
    borderColor: '#BF953F',
    borderWidth: 1.5,
  },
  menuQuantityBadge: {
    position: 'absolute',
    top: 8,
    right: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(10,10,10,0.95)',
  },
  menuQuantityBadgeText: {
    color: '#BF953F',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts?.serif,
  },
  menuCopy: {
    flex: 1,
    paddingRight: 12,
    gap: 4,
  },
  menuName: {
    color: brand.text.primary,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Fonts?.serif,
  },
  menuCategory: {
    color: brand.text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  menuPrice: {
    color: '#D7D7D7',
    fontSize: 17,
    fontWeight: '400',
  },
  orderCard: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: brand.background.deepCarbon,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
    position: 'relative',
    overflow: 'visible',
  },
  bottomBarGlow: {
    position: 'absolute',
    top: -10,
    left: 14,
    right: 14,
    height: 24,
    borderRadius: 20,
    backgroundColor: '#BF953F',
  },
  orderTitle: {
    color: brand.text.primary,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Fonts?.serif,
  },
  addMoreButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
    backgroundColor: brand.surface.card,
  },
  addMoreButtonText: {
    color: brand.text.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  viewActiveOrderButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: brand.accent.secondary,
    backgroundColor: brand.surface.card,
  },
  viewActiveOrderButtonText: {
    color: brand.accent.secondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  orderMeta: {
    color: brand.text.secondary,
    fontSize: 14,
  },
  orderMetaCount: {
    color: '#D7D7D7',
  },
  orderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  orderItemCopy: {
    flex: 1,
    gap: 4,
  },
  orderItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  orderItemName: {
    flexShrink: 1,
    color: brand.text.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  removeItemButton: {
    borderRadius: 12,
    backgroundColor: brand.background.deepCarbon,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeItemButtonText: {
    color: brand.text.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  itemQtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 8,
  },
  itemQtyControlsStacked: {
    width: '100%',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  qtyCircleButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
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
    color: '#000000',
  },
  orderItemNote: {
    color: brand.text.secondary,
    fontSize: 13,
  },
  orderItemPrice: {
    color: brand.accent.primary,
    fontWeight: '800',
    fontSize: 16,
    flexShrink: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    color: brand.text.secondary,
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    color: brand.text.primary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Fonts?.serif,
  },
  totalValueStack: {
    alignItems: 'flex-end',
    gap: 2,
  },
  totalValueBs: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  successBanner: {
    borderRadius: 20,
    backgroundColor: brand.surface.card,
    borderWidth: 1,
    borderColor: brand.status.success,
    padding: 16,
  },
  successText: {
    color: brand.text.primary,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorBanner: {
    borderRadius: 20,
    backgroundColor: brand.surface.card,
    borderWidth: 1,
    borderColor: brand.status.danger,
    padding: 16,
  },
  errorText: {
    color: brand.text.primary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: brand.overlay.scrim,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: brand.surface.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
  },
  modalTitle: {
    color: brand.text.primary,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: Fonts?.serif,
  },
  modalSubtitle: {
    color: brand.text.secondary,
    fontSize: 16,
  },
  modalHelper: {
    color: brand.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  quickNotesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    backgroundColor: brand.background.deepCarbon,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    color: '#000000',
  },
  quantityValue: {
    minWidth: 28,
    textAlign: 'center',
    color: brand.text.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  quickNoteChip: {
    borderRadius: 12,
    backgroundColor: brand.background.deepCarbon,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
  },
  quickNoteChipActive: {
    backgroundColor: brand.accent.primary,
    borderColor: brand.accent.primary,
  },
  quickNoteText: {
    color: brand.text.primary,
    fontWeight: '700',
  },
  quickNoteTextActive: {
    color: '#000000',
  },
  notesInput: {
    minHeight: 120,
    borderRadius: 12,
    backgroundColor: brand.background.deepCarbon,
    color: brand.text.primary,
    paddingHorizontal: 16,
    paddingVertical: 16,
    textAlignVertical: 'top',
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalActionsColumn: {
    gap: 12,
  },
  modalPrimaryAction: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: brand.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalPrimaryText: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '800',
  },
  modalSecondaryAction: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: brand.background.deepCarbon,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.border.subtle,
  },
  modalSecondaryText: {
    color: brand.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
