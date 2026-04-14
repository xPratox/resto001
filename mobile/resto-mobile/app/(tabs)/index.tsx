import axios, { isAxiosError } from 'axios';
import { FontAwesome5 } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RestoBrandTheme } from '@/constants/theme';
import { API_BASE_URL, SOCKET_URL } from '@/lib/api';
import { restoSocket } from '@/lib/socket';

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: 'Bebidas' | 'Platos';
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
const QUICK_NOTES = {
  Bebidas: ['Sin hielo', 'Poca azucar', 'Vaso aparte'],
  Platos: ['Con todo', 'Sin verduras', 'Extra queso'],
} as const;

const brand = RestoBrandTheme;

const initialOrder: CurrentOrder = {
  table: '',
  cliente_nombre: '',
  seccion: 'Sala',
  items: [],
  total: 0,
  status: 'pendiente',
};

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
  setIsNotesModalVisible: React.Dispatch<React.SetStateAction<boolean>>,
) {
  setCurrentOrder(initialOrder);
  setPendingItemsToAdd([]);
  setStep(1);
  setSelectedPlate(null);
  setNote('');
  setIsNotesModalVisible(false);
}

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orderId?: string;
    table?: string;
    step?: string;
    paymentSuccess?: string;
    orderUpdatedSuccess?: string;
  }>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<CurrentOrder>(initialOrder);
  const [selectedPlate, setSelectedPlate] = useState<MenuItem | null>(null);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);
  const [note, setNote] = useState('');
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

  const groupedMenuItems = useMemo(() => {
    return menuItems.reduce<Record<string, MenuItem[]>>((groups, item) => {
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

  const quickNotesForSelectedItem = selectedPlate ? QUICK_NOTES[selectedPlate.category] : QUICK_NOTES.Platos;

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
        : [];

      setMenuItems(normalizedItems);
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.message || error.message : 'Error desconocido cargando menu';

      console.log('fetchMenu error:', {
        apiBaseUrl: API_BASE_URL,
        message,
        status: isAxiosError(error) ? error.response?.status : null,
      });
      Alert.alert('Error cargando menu', message);
      setErrorMessage(`No se pudo cargar el menu. ${message}`);
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
    }, 4000);

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
  const displayedTotal = useMemo(
    () => (currentOrder._id ? currentOrder.total + pendingItemsTotal : currentOrder.total),
    [currentOrder._id, currentOrder.total, pendingItemsTotal],
  );
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

  const handleOpenNotes = (item: MenuItem) => {
    setErrorMessage('');
    setSuccessMessage('');
    setSelectedPlate(item);
    setNote('');
    setIsNotesModalVisible(true);
    setStep(3);
  };

  const handleAddItem = async () => {
    if (!selectedPlate) {
      return;
    }

    const itemNote = note.trim() || 'Sin notas';

    if (currentOrder._id) {
      setPendingItemsToAdd((previous) => [
        ...previous,
        {
          name: selectedPlate.name,
          price: selectedPlate.price,
          note: itemNote,
        },
      ]);
      setSuccessMessage(`${selectedPlate.name} listo para actualizar el pedido.`);
      setIsNotesModalVisible(false);
      setSelectedPlate(null);
      setNote('');
      setStep(2);
      return;
    }

    const nextItems = [
      ...currentOrder.items,
      {
        name: selectedPlate.name,
        price: selectedPlate.price,
        note: itemNote,
      },
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
    setStep(2);
  };

  const handleRemoveItem = (indexToRemove: number) => {
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
          onPress: async () => {
            if (currentOrder._id && itemToRemove._id) {
              try {
                const response = await axios.patch<{ order: CurrentOrder }>(`${API_BASE_URL}/api/orders/${currentOrder._id}/update-items`, {
                  items: currentOrder.items.filter((item) => item._id !== itemToRemove._id),
                },
                );

                setCurrentOrder(normalizeOrder(response.data.order));
                setSuccessMessage(`${itemToRemove.name} fue eliminado de la orden.`);
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
          },
        },
      ],
    );
  };

  const handleCloseModal = () => {
    setIsNotesModalVisible(false);
    setSelectedPlate(null);
    setNote('');
    setStep(2);
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
          setIsNotesModalVisible,
        );
        Alert.alert('Pedido actualizado', successCopy);
        router.replace({
          pathname: '/',
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
        setIsNotesModalVisible,
      );
      Alert.alert('Pedido enviado', successCopy);
      router.replace({
        pathname: '/',
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
          <Text style={styles.overline}>Resto 001</Text>
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
                const statusLabel = isCleaning ? 'Limpieza' : occupied ? 'Ocupada' : 'Disponible';

                return (
                  <Pressable
                    key={table.table}
                    onPress={() => handleTablePress(table)}
                    style={[
                      styles.giantButton,
                      table.highlighted && styles.giantButtonLarge,
                      isCleaning ? styles.giantButtonCleaning : occupied && styles.giantButtonOccupied,
                      selected && !occupied && !isCleaning && styles.giantButtonSelected,
                    ]}>
                    <View style={styles.tableButtonHeader}>
                      <Text style={[styles.tableStatusBadge, (occupied || isCleaning) && styles.tableStatusBadgeOccupied]}>
                        {statusLabel}
                      </Text>
                      {occupied ? <FontAwesome5 name={isCleaning ? 'broom' : 'user-alt'} size={16} color={brand.text.contrastOnAccent} /> : null}
                    </View>
                    <Text style={[styles.giantButtonLabel, (occupied || isCleaning) && styles.giantButtonLabelOccupied]}>
                      {table.table}
                    </Text>
                    <Text style={[styles.giantButtonMeta, (occupied || isCleaning) && styles.giantButtonMetaOccupied]}>
                      {isCleaning
                        ? 'Cuenta cobrada. Esperando liberacion manual.'
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
                <Text style={styles.sectionText}>Toca cualquier item para abrir el paso 3 de notas.</Text>
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
                {['Bebidas', 'Platos'].map((category) => {
                  const items = groupedMenuItems[category] ?? [];

                  if (items.length === 0) {
                    return null;
                  }

                  return (
                    <View key={category} style={styles.menuSection}>
                      <Text style={styles.menuSectionTitle}>{category}</Text>
                      {items.map((item) => (
                        <Pressable
                          key={item.id}
                          onPress={() => handleOpenNotes(item)}
                          style={styles.menuCard}>
                          <View style={styles.menuCopy}>
                            <Text style={styles.menuName}>{item.name}</Text>
                            <Text style={styles.menuCategory}>{item.category}</Text>
                          </View>
                          <Text style={styles.menuPrice}>${item.price.toFixed(2)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.orderCard}>
              <Text style={styles.orderTitle}>Pedido actual</Text>
              <Text style={styles.orderMeta}>{currentOrder.table || 'Mesa pendiente'}</Text>
              <Text style={styles.orderMeta}>{currentOrder.seccion || 'Sala'}</Text>
              {currentOrder.cliente_nombre ? <Text style={styles.orderMeta}>Reserva: {currentOrder.cliente_nombre}</Text> : null}
              <Text style={styles.orderMeta}>{totalItems} platos agregados</Text>

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

              {combinedOrderItems.map((item, index) => (
                <View key={`${item.name}-${index}`} style={styles.orderItemRow}>
                  <View style={styles.orderItemCopy}>
                    <View style={styles.orderItemHeader}>
                      <Text style={styles.orderItemName}>{item.name}</Text>
                      {canRemoveItems ? (
                        <Pressable
                          onPress={() => handleRemoveItem(index)}
                          style={styles.removeItemButton}>
                          <Text style={styles.removeItemButtonText}>Quitar</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={styles.orderItemNote}>{item.note}</Text>
                  </View>
                  <Text style={styles.orderItemPrice}>${item.price.toFixed(2)}</Text>
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
            </View>
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
                <Text style={styles.primaryActionText}>Agregar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 20,
    gap: 18,
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: '#1E293B',
    padding: 22,
    borderWidth: 1,
    borderColor: '#334155',
  },
  overline: {
    color: brand.accent.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 12,
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: '#334155',
  },
  connectionText: {
    color: '#CBD5E1',
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
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepPillActive: {
    backgroundColor: brand.accent.primary,
    borderColor: brand.accent.primary,
  },
  stepLabel: {
    textAlign: 'center',
    color: '#F8FAFC',
    fontWeight: '700',
  },
  stepLabelActive: {
    color: '#000000',
  },
  sectionCard: {
    borderRadius: 28,
    backgroundColor: '#1E293B',
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionHeaderRow: {
    gap: 14,
  },
  sectionHeaderCopy: {
    maxWidth: '100%',
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
  },
  sectionText: {
    marginTop: 4,
    color: '#CBD5E1',
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
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryChipMenuBack: {
    alignSelf: 'flex-start',
  },
  secondaryChipText: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  loaderWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: '#F8FAFC',
    fontSize: 15,
  },
  menuList: {
    gap: 12,
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
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuCopy: {
    flex: 1,
    paddingRight: 12,
    gap: 4,
  },
  menuName: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  menuCategory: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  menuPrice: {
    color: brand.accent.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  orderCard: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  orderTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  addMoreButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
  },
  addMoreButtonText: {
    color: '#F8FAFC',
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
    color: '#CBD5E1',
    fontSize: 14,
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
    gap: 10,
  },
  orderItemName: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 16,
  },
  removeItemButton: {
    borderRadius: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeItemButtonText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  orderItemNote: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  orderItemPrice: {
    color: brand.accent.primary,
    fontWeight: '800',
    fontSize: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
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
    backgroundColor: 'rgba(15,23,42,0.78)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    gap: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#CBD5E1',
    fontSize: 16,
  },
  modalHelper: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
  },
  quickNotesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickNoteChip: {
    borderRadius: 12,
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickNoteChipActive: {
    backgroundColor: brand.accent.primary,
    borderColor: brand.accent.primary,
  },
  quickNoteText: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  quickNoteTextActive: {
    color: '#000000',
  },
  notesInput: {
    minHeight: 120,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 16,
    textAlignVertical: 'top',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalSecondaryText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
});
