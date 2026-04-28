import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { RotateCcw } from 'lucide-react-native/dist/cjs/lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, type MobileBrandTheme } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { useMobileAuth } from '@/lib/auth-session';
import { useMobileTheme } from '@/src/theme/mobile-theme';

type AdminReportResponse = {
  ok?: boolean;
  kpis?: {
    totalRevenue?: number;
  };
  mesoneroStats?: {
    usuario?: string;
    nombre?: string;
    mesasAtendidas?: number;
    pagosRegistrados?: number;
    ultimoServicio?: string;
  }[];
};

type MesoneroStat = {
  usuario: string;
  nombre: string;
  mesasAtendidas: number;
  pagosRegistrados: number;
  ultimoServicio: string;
};

type AdminTablesResponse = {
  ok?: boolean;
  tables?: {
    occupied?: boolean;
  }[];
};

type AdminRateResponse = {
  ok?: boolean;
  manualRates?: {
    bcv?: {
      value?: number | null;
    } | null;
    cop?: {
      value?: number | null;
    } | null;
  };
  resolvedRates?: {
    bcv?: {
      rate?: number | null;
    } | null;
    cop?: {
      rate?: number | null;
    } | null;
  };
};

type AdminMenuItemPayload = {
  _id?: string;
  id?: string;
  nombre?: string;
  descripcion?: string;
  categoria?: string;
  precio?: number;
};

type AdminMenuResponse = {
  ok?: boolean;
  items?: AdminMenuItemPayload[];
};

type AdminUserPayload = {
  _id?: string;
  nombre?: string;
  usuario?: string;
  rol?: string;
  is_online?: boolean;
};

type AdminUsersResponse = {
  ok?: boolean;
  users?: AdminUserPayload[];
};

type DashboardCard = {
  id: string;
  label: string;
  value: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type MenuItem = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio: number;
};

type GroupedMenu = Record<string, MenuItem[]>;

type StaffMember = {
  id: string;
  nombre: string;
  usuario: string;
  rol: string;
  isOnline: boolean;
};

type MenuFormState = {
  nombre: string;
  descripcion: string;
  categoria: string;
  precio: string;
};

type UserFormState = {
  nombre: string;
  usuario: string;
  rol: string;
  contrasena: string;
};

type AdminSection = 'dashboard' | 'menu' | 'users' | 'settings';

const DEFAULT_MENU_FORM: MenuFormState = {
  nombre: '',
  descripcion: '',
  categoria: 'Platos',
  precio: '',
};

const DEFAULT_USER_FORM: UserFormState = {
  nombre: '',
  usuario: '',
  rol: 'mesonero',
  contrasena: '',
};

const FALLBACK_CATEGORIES = ['Platos', 'Bebidas', 'Postres', 'Especiales'];
const USER_ROLES = ['admin', 'caja', 'mesonero', 'cocina'];
const ADMIN_NAV_ITEMS: { id: AdminSection; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { id: 'menu', label: 'Menu / Platos', icon: 'restaurant-outline' },
  { id: 'users', label: 'Usuarios / Personal', icon: 'people-outline' },
  { id: 'settings', label: 'Ajustes Globales', icon: 'settings-outline' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function normalizeMenuItems(items: AdminMenuItemPayload[] | undefined) {
  return (items || [])
    .map((item, index) => {
      const nombre = String(item.nombre || '').trim();

      if (!nombre) {
        return null;
      }

      return {
        id: String(item._id || item.id || `menu-${index}`),
        nombre,
        descripcion: String(item.descripcion || '').trim(),
        categoria: String(item.categoria || 'Platos').trim() || 'Platos',
        precio: Number(item.precio || 0),
      } satisfies MenuItem;
    })
    .filter((item): item is MenuItem => Boolean(item));
}

function normalizeUsers(users: AdminUserPayload[] | undefined) {
  return (users || []).map((user, index) => ({
    id: String(user._id || `user-${index}`),
    nombre: String(user.nombre || user.usuario || 'Usuario').trim(),
    usuario: String(user.usuario || '').trim().toLowerCase(),
    rol: String(user.rol || 'personal').trim().toLowerCase(),
    isOnline: Boolean(user.is_online),
  }));
}

function normalizeMesoneroStats(stats: AdminReportResponse['mesoneroStats']) {
  return (stats || []).map((item, index) => ({
    usuario: String(item?.usuario || `mesonero-${index}`).trim().toLowerCase(),
    nombre: String(item?.nombre || item?.usuario || 'Santiago').trim(),
    mesasAtendidas: Number(item?.mesasAtendidas || 0),
    pagosRegistrados: Number(item?.pagosRegistrados || 0),
    ultimoServicio: String(item?.ultimoServicio || '').trim(),
  })) satisfies MesoneroStat[];
}

function CategoryAccordion({
  tituloCategoria,
  itemsList,
  deletingItemId,
  onEdit,
  onDelete,
  styles,
}: {
  tituloCategoria: string;
  itemsList: MenuItem[];
  deletingItemId: string | null;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.menuAccordionCard}>
      <Pressable onPress={() => setIsOpen((current) => !current)} style={styles.menuAccordionHeader}>
        <Text style={styles.menuAccordionTitle}>{tituloCategoria.toUpperCase()}</Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={isOpen ? '#BF953F' : '#B0B0B0'}
          style={isOpen ? styles.menuAccordionIconOpen : styles.menuAccordionIcon}
        />
      </Pressable>

      {isOpen ? (
        <View style={styles.menuAccordionBody}>
          {itemsList.map((item) => (
            <View key={item.id} style={styles.listCard}>
              <View style={styles.listCardTopRow}>
                <Text style={styles.listCardTitle}>{item.nombre}</Text>
                <Text style={styles.priceTag}>{formatCurrency(item.precio)}</Text>
              </View>
              <Text style={styles.listCardDescription}>{item.descripcion || 'Sin descripción adicional.'}</Text>
              <View style={styles.menuActionRow}>
                <Pressable style={styles.menuActionButton} onPress={() => onEdit(item)}>
                  <Text style={styles.menuActionText}>Editar</Text>
                </Pressable>
                <Pressable
                  style={styles.menuActionDangerButton}
                  onPress={() => onDelete(item)}
                  disabled={deletingItemId === item.id}
                >
                  {deletingItemId === item.id ? (
                    <ActivityIndicator size="small" color="#F6F6F6" />
                  ) : (
                    <Text style={styles.menuActionDangerText}>Eliminar</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function AdminMobileScreen() {
  const { session, logout } = useMobileAuth();
  const router = useRouter();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [mesoneroStats, setMesoneroStats] = useState<MesoneroStat[]>([]);
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<MenuFormState>(DEFAULT_MENU_FORM);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);
  const [isUserSubmitting, setIsUserSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(DEFAULT_USER_FORM);
  const [bcvDraft, setBcvDraft] = useState('');
  const [copDraft, setCopDraft] = useState('');
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [isResettingRates, setIsResettingRates] = useState(false);
  const groupedMenuItems = useMemo<GroupedMenu>(() => {
    return menuItems.reduce<GroupedMenu>((accumulator, item) => {
      const category = String(item.categoria || 'MENU').trim().toUpperCase() || 'MENU';

      if (!accumulator[category]) {
        accumulator[category] = [];
      }

      accumulator[category].push(item);
      return accumulator;
    }, {});
  }, [menuItems]);
  const groupedMenuCategories = useMemo(() => Object.keys(groupedMenuItems), [groupedMenuItems]);

  const requestJson = useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${session?.token || ''}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.message || 'No se pudo completar la solicitud.'));
      }

      return payload as T;
    },
    [session?.token],
  );

  const loadAdminData = useCallback(
    async (showSkeleton = false) => {
      if (showSkeleton) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setErrorMessage('');

      try {
        const [report, tables, settings, menu, users] = await Promise.all([
          requestJson<AdminReportResponse>('/api/admin/reports?range=today'),
          requestJson<AdminTablesResponse>('/api/tables/status'),
          requestJson<AdminRateResponse>('/api/admin/settings'),
          requestJson<AdminMenuResponse>('/api/admin/menu'),
          requestJson<AdminUsersResponse>('/api/admin/users'),
        ]);

        const ventasHoy = Number(report.kpis?.totalRevenue || 0);
        const mesasActivas = (tables.tables || []).filter((table) => Boolean(table.occupied)).length;
        const bcvRate = Number(settings.resolvedRates?.bcv?.rate || 0);
        const copRate = Number(settings.resolvedRates?.cop?.rate || 0);

        const nextBcvDraft = Number(settings.manualRates?.bcv?.value ?? settings.resolvedRates?.bcv?.rate ?? 0);
        const nextCopDraft = Number(settings.manualRates?.cop?.value ?? settings.resolvedRates?.cop?.rate ?? 0);

        setBcvDraft(Number.isFinite(nextBcvDraft) && nextBcvDraft > 0 ? nextBcvDraft.toFixed(2) : '');
        setCopDraft(Number.isFinite(nextCopDraft) && nextCopDraft > 0 ? nextCopDraft.toFixed(2) : '');

        setCards([
          {
            id: 'ventas-hoy',
            label: 'Ventas hoy',
            value: formatCurrency(ventasHoy),
            helper: 'Corte operativo del día',
            icon: 'cash-outline',
          },
          {
            id: 'mesas-activas',
            label: 'Mesas activas',
            value: String(mesasActivas),
            helper: 'Mesas ocupadas en sala y terraza',
            icon: 'grid-outline',
          },
          {
            id: 'tasa-actual',
            label: 'Tasa actual',
            value: bcvRate > 0 ? `BCV ${bcvRate.toFixed(2)}` : 'Sin tasa',
            helper: copRate > 0 ? `COP ${copRate.toFixed(2)}` : 'COP pendiente',
            icon: 'swap-horizontal-outline',
          },
        ]);
        setMenuItems(normalizeMenuItems(menu.items));
        setStaff(normalizeUsers(users.users));
        const nextMesoneroStats = normalizeMesoneroStats(report.mesoneroStats);
        setMesoneroStats(nextMesoneroStats.length ? nextMesoneroStats : [{
          usuario: 'santiago',
          nombre: 'Santiago',
          mesasAtendidas: 0,
          pagosRegistrados: 0,
          ultimoServicio: '',
        }]);

        const discoveredCategories = Array.from(new Set(normalizeMenuItems(menu.items).map((item) => item.categoria).filter(Boolean)));
        setCategories(discoveredCategories.length ? discoveredCategories : FALLBACK_CATEGORIES);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo cargar el panel administrativo.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [requestJson],
  );

  useEffect(() => {
    void loadAdminData(true);
  }, [loadAdminData]);

  const closeMenuModal = useCallback(() => {
    setIsModalVisible(false);
    setEditingItem(null);
    setForm(DEFAULT_MENU_FORM);
  }, []);

  const openCreateMenuModal = useCallback(() => {
    setEditingItem(null);
    setForm(DEFAULT_MENU_FORM);
    setIsModalVisible(true);
  }, []);

  const openEditMenuModal = useCallback((item: MenuItem) => {
    setEditingItem(item);
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion,
      categoria: item.categoria,
      precio: String(item.precio),
    });
    setIsModalVisible(true);
  }, []);

  const handleSaveMenuItem = useCallback(async () => {
    const precio = Number.parseFloat(form.precio.replace(',', '.'));

    if (!form.nombre.trim() || !form.categoria.trim() || !Number.isFinite(precio) || precio < 0) {
      setErrorMessage('Debes completar nombre, categoría y precio válido.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        categoria: form.categoria.trim(),
        precio,
      };

      await requestJson(editingItem ? `/api/admin/menu/${editingItem.id}` : '/api/admin/menu', {
        method: editingItem ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...payload,
        }),
      });

      closeMenuModal();
      await loadAdminData(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo guardar el plato.');
    } finally {
      setIsSubmitting(false);
    }
  }, [closeMenuModal, editingItem, form, loadAdminData, requestJson]);

  const handleDeleteMenuItem = useCallback(
    (item: MenuItem) => {
      Alert.alert('Eliminar producto', `Deseas eliminar "${item.nombre}"?`, [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingItemId(item.id);
              setErrorMessage('');

              try {
                await requestJson(`/api/admin/menu/${item.id}`, {
                  method: 'DELETE',
                });

                if (editingItem?.id === item.id) {
                  closeMenuModal();
                }

                await loadAdminData(false);
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'No se pudo eliminar el plato.');
              } finally {
                setDeletingItemId(null);
              }
            })();
          },
        },
      ]);
    },
    [closeMenuModal, editingItem?.id, loadAdminData, requestJson],
  );

  const openCreateUserModal = useCallback(() => {
    setEditingUser(null);
    setUserForm(DEFAULT_USER_FORM);
    setIsUserModalVisible(true);
  }, []);

  const openEditUserModal = useCallback((member: StaffMember) => {
    setEditingUser(member);
    setUserForm({
      nombre: member.nombre,
      usuario: member.usuario,
      rol: member.rol,
      contrasena: '',
    });
    setIsUserModalVisible(true);
  }, []);

  const closeUserModal = useCallback(() => {
    setIsUserModalVisible(false);
    setEditingUser(null);
    setUserForm(DEFAULT_USER_FORM);
  }, []);

  const handleSaveUser = useCallback(async () => {
    const payload = {
      nombre: userForm.nombre.trim(),
      usuario: userForm.usuario.trim().toLowerCase(),
      rol: userForm.rol.trim().toLowerCase(),
      contrasena: userForm.contrasena.trim(),
    };

    if (!payload.nombre || !payload.usuario || !payload.rol) {
      setErrorMessage('Debes completar nombre, usuario y rol.');
      return;
    }

    if (!editingUser && !payload.contrasena) {
      setErrorMessage('Para crear usuario debes indicar una contraseña.');
      return;
    }

    setIsUserSubmitting(true);
    setErrorMessage('');

    try {
      const body = editingUser && !payload.contrasena
        ? {
            nombre: payload.nombre,
            usuario: payload.usuario,
            rol: payload.rol,
          }
        : payload;

      await requestJson(editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users', {
        method: editingUser ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      closeUserModal();
      await loadAdminData(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo guardar el usuario.');
    } finally {
      setIsUserSubmitting(false);
    }
  }, [closeUserModal, editingUser, loadAdminData, requestJson, userForm]);

  const handleSaveRates = useCallback(async () => {
    const parsedBcv = Number.parseFloat(bcvDraft.replace(',', '.'));
    const parsedCop = Number.parseFloat(copDraft.replace(',', '.'));

    if (!Number.isFinite(parsedBcv) || parsedBcv <= 0 || !Number.isFinite(parsedCop) || parsedCop <= 0) {
      setErrorMessage('Debes indicar tasas válidas mayores a cero para BCV y COP.');
      return;
    }

    setIsSavingRates(true);
    setErrorMessage('');

    try {
      await requestJson('/api/admin/settings/rates', {
        method: 'PUT',
        body: JSON.stringify({
          bcv: parsedBcv,
          cop: parsedCop,
        }),
      });

      await loadAdminData(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron actualizar las tasas.');
    } finally {
      setIsSavingRates(false);
    }
  }, [bcvDraft, copDraft, loadAdminData, requestJson]);

  const handleConfirmResetRates = useCallback(() => {
    Alert.alert('Confirmar Reinicio', '¿Estás seguro de volver la tasa a 0?', [
      {
        text: 'No',
        style: 'cancel',
      },
      {
        text: 'Sí',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (isResettingRates) {
              return;
            }

            setIsResettingRates(true);
            setErrorMessage('');

            try {
              await requestJson('/api/tasa/reset', {
                method: 'POST',
              });

              setBcvDraft('0.00');
              setCopDraft('0.00');
              setCards((currentCards) =>
                currentCards.map((card) => {
                  if (card.id !== 'tasa-actual') {
                    return card;
                  }

                  return {
                    ...card,
                    value: 'BCV 0.00',
                    helper: 'COP 0.00',
                  };
                }),
              );

              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : 'No se pudo reiniciar la tasa.');
            } finally {
              setIsResettingRates(false);
            }
          })();
        },
      },
    ]);
  }, [isResettingRates, requestJson]);

  if (!session) {
    return null;
  }

  const isAdminRole = String(session.rol || '').trim().toLowerCase() === 'admin';
  const isSuperAdmin = String(session.usuario || '').trim().toLowerCase() === 'admin';

  const activeSectionLabel = ADMIN_NAV_ITEMS.find((item) => item.id === activeSection)?.label || 'Dashboard';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ADMIN MOBILE</Text>
          <Text style={styles.title}>{activeSectionLabel}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.ghostButton} onPress={() => router.push('/(admin)/web')}>
            <Text style={styles.ghostButtonText}>Admin Web</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={() => void loadAdminData(false)}>
            {isRefreshing ? <ActivityIndicator size="small" color={theme.text.primary} /> : <Text style={styles.ghostButtonText}>Actualizar</Text>}
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
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {errorMessage ? <Text style={styles.errorBox}>{errorMessage}</Text> : null}

            {activeSection === 'dashboard' ? (
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

                {isSuperAdmin ? (
                  <View style={styles.metricCard}>
                    <View style={styles.metricIconWrap}>
                      <Ionicons name="people-outline" size={18} color={theme.accent.primary} />
                    </View>
                    <Text style={styles.metricLabel}>MESONEROS</Text>
                    <Text style={styles.metricValue}>{mesoneroStats.length}</Text>
                    <Text style={styles.metricHelper}>Estadísticas de mesas atendidas por mesonero</Text>

                    <View style={styles.mesoneroStatsList}>
                      {mesoneroStats.map((mesonero) => (
                        <View key={mesonero.usuario} style={styles.mesoneroStatRow}>
                          <View style={styles.mesoneroStatCopy}>
                            <Text style={styles.mesoneroStatName}>{mesonero.nombre}</Text>
                            <Text style={styles.mesoneroStatMeta}>{mesonero.mesasAtendidas} mesas atendidas</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {activeSection === 'menu' ? (
              <>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>MENÚ</Text>
                    <Text style={styles.sectionTitle}>Platos publicados</Text>
                  </View>
                  <Text style={styles.sectionMeta}>{menuItems.length} items</Text>
                </View>

                <View style={styles.menuCardContainer}>
                  <ScrollView style={styles.menuCardScroll} contentContainerStyle={styles.menuCardContent} showsVerticalScrollIndicator={false}>
                    {menuItems.length ? (
                      groupedMenuCategories.map((category) => (
                        <CategoryAccordion
                          key={category}
                          tituloCategoria={category}
                          itemsList={groupedMenuItems[category] ?? []}
                          deletingItemId={deletingItemId}
                          onEdit={openEditMenuModal}
                          onDelete={handleDeleteMenuItem}
                          styles={styles}
                        />
                      ))
                    ) : (
                      <View style={styles.emptyCard}>
                        <Text style={styles.emptyCardTitle}>No hay platos cargados.</Text>
                        <Text style={styles.emptyCardText}>Usa el botón flotante para registrar el primer producto del menú móvil.</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              </>
            ) : null}

            {activeSection === 'users' ? (
              <>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>PERSONAL</Text>
                  </View>
                  <View style={styles.sectionHeaderActions}>
                    <Text style={styles.sectionMeta}>{staff.length} usuarios</Text>
                    <Pressable style={styles.sectionAddButton} onPress={openCreateUserModal}>
                      <Text style={styles.sectionAddButtonText}>Nuevo</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.section}>
                  {staff.length ? (
                    staff.map((member) => (
                      <View key={member.id} style={styles.staffCard}>
                        <View style={[styles.statusDot, member.isOnline ? styles.statusDotOnline : styles.statusDotOffline]} />
                        <View style={styles.staffCopy}>
                          <Text style={styles.staffName}>{member.nombre}</Text>
                          <Text style={styles.staffMeta}>@{member.usuario || 'sin-usuario'} · {member.rol}</Text>
                        </View>
                        <View style={styles.staffActions}>
                          <Text style={styles.staffStatus}>{member.isOnline ? 'Conectado' : 'Desconectado'}</Text>
                          <Pressable style={styles.staffEditButton} onPress={() => openEditUserModal(member)}>
                            <Text style={styles.staffEditButtonText}>Editar</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyCardTitle}>No hay personal disponible.</Text>
                      <Text style={styles.emptyCardText}>Cuando existan usuarios en backend aparecerán aquí con su estado en tiempo real.</Text>
                    </View>
                  )}
                </View>
              </>
            ) : null}

            {activeSection === 'settings' ? (
              <View style={styles.section}>
                <View style={styles.metricCard}>
                  <View style={styles.metricIconWrap}>
                    <Ionicons name="swap-horizontal-outline" size={18} color={theme.accent.primary} />
                  </View>
                  <Text style={styles.metricLabel}>TASA ACTIVA</Text>
                  <Text style={styles.metricValue}>{cards.find((card) => card.id === 'tasa-actual')?.value || 'Sin tasa'}</Text>
                  <Text style={styles.metricHelper}>{cards.find((card) => card.id === 'tasa-actual')?.helper || 'Sin actualización reciente.'}</Text>

                  <View style={styles.ratesEditorGrid}>
                    <View style={styles.rateFieldWrap}>
                      <Text style={styles.rateFieldLabel}>BCV</Text>
                      <TextInput
                        style={styles.rateFieldInput}
                        value={bcvDraft}
                        onChangeText={setBcvDraft}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={theme.text.muted}
                        editable={isSuperAdmin && !isSavingRates}
                      />
                    </View>

                    <View style={styles.rateFieldWrap}>
                      <Text style={styles.rateFieldLabel}>COP</Text>
                      <TextInput
                        style={styles.rateFieldInput}
                        value={copDraft}
                        onChangeText={setCopDraft}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={theme.text.muted}
                        editable={isSuperAdmin && !isSavingRates}
                      />
                    </View>
                  </View>

                  {isSuperAdmin ? (
                    <Pressable style={[styles.primaryButton, isSavingRates && styles.primaryButtonDisabled]} onPress={() => void handleSaveRates()} disabled={isSavingRates}>
                      {isSavingRates ? <ActivityIndicator size="small" color={theme.text.onAccent} /> : <Text style={styles.primaryButtonText}>Guardar tasas</Text>}
                    </Pressable>
                  ) : (
                    <Text style={styles.metricHelper}>Solo el super admin puede actualizar las tasas.</Text>
                  )}

                  {isAdminRole && (
                    <TouchableOpacity
                      style={[styles.resetRateButton, isResettingRates && styles.resetRateButtonDisabled]}
                      onPress={handleConfirmResetRates}
                      disabled={isResettingRates}
                      activeOpacity={0.85}>
                      {isResettingRates ? (
                        <ActivityIndicator size="small" color="#BF953F" />
                      ) : (
                        <RotateCcw size={16} color="#BF953F" strokeWidth={2} />
                      )}
                      <Text style={styles.resetRateButtonText}>RESET TASA</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.metricCard}>
                  <View style={styles.listRowBetween}>
                    <View>
                      <Text style={styles.metricLabel}>SESIÓN</Text>
                      <Text style={styles.sessionTitle}>{session.nombre || session.usuario}</Text>
                      <Text style={styles.metricHelper}>{session.rol}</Text>
                    </View>
                    <View style={styles.metricIconWrap}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={theme.accent.primary} />
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {activeSection === 'menu' ? (
            <Pressable style={styles.fab} onPress={openCreateMenuModal}>
              <Ionicons name="add" size={26} color={theme.text.onAccent} />
            </Pressable>
          ) : null}

          <View style={styles.bottomNavShell}>
            <View style={styles.bottomNav}>
              {ADMIN_NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;

                return (
                  <Pressable
                    key={item.id}
                    style={[styles.bottomNavItem, isActive && styles.bottomNavItemActive]}
                    onPress={() => setActiveSection(item.id)}>
                    <Ionicons name={item.icon} size={18} color={isActive ? theme.text.onAccent : theme.text.secondary} />
                    <Text style={[styles.bottomNavLabel, isActive && styles.bottomNavLabelActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}

      <Modal visible={isModalVisible} animationType="slide" transparent onRequestClose={closeMenuModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>{editingItem ? 'EDITAR PLATO' : 'NUEVO PLATO'}</Text>
            <Text style={styles.modalTitle}>{editingItem ? 'Actualizar producto' : 'Alta rápida de menú'}</Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Nombre</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.nombre}
                onChangeText={(value) => setForm((current) => ({ ...current, nombre: value }))}
                placeholder="Ej. Risotto trufado"
                placeholderTextColor={theme.text.muted}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Descripción</Text>
              <TextInput
                style={[styles.fieldInput, styles.textArea]}
                multiline
                value={form.descripcion}
                onChangeText={(value) => setForm((current) => ({ ...current, descripcion: value }))}
                placeholder="Detalles breves del plato"
                placeholderTextColor={theme.text.muted}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Categoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {categories.map((category) => {
                  const isActive = form.categoria === category;

                  return (
                    <Pressable
                      key={category}
                      style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                      onPress={() => setForm((current) => ({ ...current, categoria: category }))}>
                      <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{category}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Precio USD</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.precio}
                onChangeText={(value) => setForm((current) => ({ ...current, precio: value }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.text.muted}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.ghostButton} onPress={closeMenuModal}>
                <Text style={styles.ghostButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]} onPress={() => void handleSaveMenuItem()} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator size="small" color={theme.text.onAccent} /> : <Text style={styles.primaryButtonText}>{editingItem ? 'Actualizar' : 'Guardar'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isUserModalVisible} animationType="slide" transparent onRequestClose={closeUserModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>{editingUser ? 'EDITAR USUARIO' : 'NUEVO USUARIO'}</Text>
            <Text style={styles.modalTitle}>{editingUser ? 'Actualizar personal' : 'Alta de personal'}</Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Nombre</Text>
              <TextInput
                style={styles.fieldInput}
                value={userForm.nombre}
                onChangeText={(value) => setUserForm((current) => ({ ...current, nombre: value }))}
                placeholder="Ej. Maria Lopez"
                placeholderTextColor={theme.text.muted}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Usuario</Text>
              <TextInput
                style={styles.fieldInput}
                value={userForm.usuario}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => setUserForm((current) => ({ ...current, usuario: value }))}
                placeholder="usuario"
                placeholderTextColor={theme.text.muted}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Rol</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {USER_ROLES.map((roleOption) => {
                  const isActive = userForm.rol === roleOption;

                  return (
                    <Pressable
                      key={roleOption}
                      style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                      onPress={() => setUserForm((current) => ({ ...current, rol: roleOption }))}>
                      <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>{roleOption}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña'}</Text>
              <TextInput
                style={styles.fieldInput}
                value={userForm.contrasena}
                secureTextEntry
                onChangeText={(value) => setUserForm((current) => ({ ...current, contrasena: value }))}
                placeholder={editingUser ? 'Dejar vacío para conservar' : 'Clave de acceso'}
                placeholderTextColor={theme.text.muted}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.ghostButton} onPress={closeUserModal}>
                <Text style={styles.ghostButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, isUserSubmitting && styles.primaryButtonDisabled]} onPress={() => void handleSaveUser()} disabled={isUserSubmitting}>
                {isUserSubmitting ? <ActivityIndicator size="small" color={theme.text.onAccent} /> : <Text style={styles.primaryButtonText}>{editingUser ? 'Actualizar' : 'Crear'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
      paddingBottom: 152,
      gap: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: -4,
      marginTop: 4,
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
    sectionMeta: {
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: Fonts?.sans,
    },
    sectionHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionAddButton: {
      minHeight: 32,
      borderRadius: 10,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent.primary,
    },
    sectionAddButtonText: {
      color: theme.text.onAccent,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
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
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
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
    mesoneroStatsList: {
      gap: 10,
      marginTop: 8,
    },
    mesoneroStatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.background.deepCarbon,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    mesoneroStatCopy: {
      flex: 1,
      gap: 4,
    },
    mesoneroStatName: {
      color: theme.text.primary,
      fontSize: 15,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    mesoneroStatMeta: {
      color: theme.text.secondary,
      fontSize: 12,
      fontFamily: Fonts?.sans,
    },
    ratesEditorGrid: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 8,
    },
    rateFieldWrap: {
      flex: 1,
      gap: 6,
    },
    rateFieldLabel: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 1.5,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    rateFieldInput: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.background.deepCarbon,
      color: theme.text.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: Fonts?.sans,
      fontSize: 14,
    },
    listCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#1A1A1A',
      backgroundColor: '#0A0A0A',
      padding: 16,
      gap: 8,
    },
    listCardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    listCardTitle: {
      flex: 1,
      color: theme.text.primary,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    priceTag: {
      color: '#D7D7D7',
      fontSize: 14,
      fontWeight: '400',
      fontFamily: Fonts?.sans,
    },
    listCardMeta: {
      color: theme.text.muted,
      fontSize: 12,
      letterSpacing: 2,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    listCardDescription: {
      color: theme.text.secondary,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: Fonts?.sans,
    },
    menuActionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
    },
    menuActionButton: {
      minHeight: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#3A3A3A',
      backgroundColor: '#1F1F1F',
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuActionText: {
      color: theme.text.primary,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    menuActionDangerButton: {
      minHeight: 36,
      borderRadius: 10,
      backgroundColor: '#5A2A2A',
      borderWidth: 1,
      borderColor: '#703232',
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuActionDangerText: {
      color: theme.text.onAccent,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    listRowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    staffCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      padding: 16,
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    statusDotOnline: {
      backgroundColor: '#3FAE5A',
    },
    statusDotOffline: {
      backgroundColor: theme.status.danger,
    },
    staffCopy: {
      flex: 1,
      gap: 4,
    },
    staffName: {
      color: theme.text.primary,
      fontSize: 16,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    staffMeta: {
      color: theme.text.muted,
      fontSize: 12,
      fontFamily: Fonts?.sans,
    },
    staffStatus: {
      color: theme.text.secondary,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    staffActions: {
      alignItems: 'flex-end',
      gap: 8,
    },
    staffEditButton: {
      minHeight: 30,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.elevated,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    staffEditButtonText: {
      color: theme.text.primary,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    sessionTitle: {
      marginTop: 6,
      color: theme.text.primary,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
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
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    resetRateButton: {
      marginTop: 10,
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#BF953F',
      backgroundColor: '#000000',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
    },
    resetRateButtonDisabled: {
      opacity: 0.7,
    },
    resetRateButtonText: {
      color: '#BF953F',
      fontSize: 13,
      fontFamily: Fonts?.serif,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
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
    fab: {
      position: 'absolute',
      right: 24,
      bottom: 112,
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent.primary,
      shadowColor: theme.accent.primary,
      shadowOpacity: 0.28,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    bottomNavShell: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 14,
      paddingBottom: 14,
      paddingTop: 10,
      backgroundColor: 'transparent',
    },
    bottomNav: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.elevated,
      padding: 8,
      shadowColor: '#000000',
      shadowOpacity: 0.24,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    bottomNavItem: {
      flex: 1,
      minHeight: 72,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 6,
      paddingVertical: 10,
      backgroundColor: 'transparent',
    },
    bottomNavItemActive: {
      backgroundColor: theme.accent.primary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.accent,
    },
    bottomNavLabel: {
      color: theme.text.secondary,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    bottomNavLabelActive: {
      color: theme.text.onAccent,
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
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.overlay.scrim,
    },
    modalCard: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: theme.surface.elevated,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 32,
      gap: 14,
    },
    modalEyebrow: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 3,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    modalTitle: {
      color: theme.text.primary,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '700',
      fontFamily: Fonts?.serif,
    },
    fieldWrap: {
      gap: 8,
    },
    fieldLabel: {
      color: theme.text.muted,
      fontSize: 11,
      letterSpacing: 2,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    fieldInput: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.background.deepCarbon,
      color: theme.text.primary,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontFamily: Fonts?.sans,
    },
    textArea: {
      minHeight: 92,
      textAlignVertical: 'top',
    },
    categoryRow: {
      gap: 8,
    },
    categoryChip: {
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    categoryChipActive: {
      borderColor: theme.border.accent,
      backgroundColor: `${theme.accent.primary}18`,
    },
    categoryChipText: {
      color: theme.text.secondary,
      fontSize: 12,
      fontWeight: '700',
      fontFamily: Fonts?.sans,
    },
    categoryChipTextActive: {
      color: theme.text.primary,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
    },
    menuCardContainer: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: '#1A1A1A',
      backgroundColor: '#0A0A0A',
      padding: 0,
      marginTop: 10,
      marginBottom: 10,
      minHeight: 320,
      maxHeight: 420,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    menuCardScroll: {
      flex: 1,
    },
    menuCardContent: {
      padding: 16,
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
    },  });