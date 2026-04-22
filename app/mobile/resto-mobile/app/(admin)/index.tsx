import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
};

type AdminTablesResponse = {
  ok?: boolean;
  tables?: Array<{
    occupied?: boolean;
  }>;
};

type AdminRateResponse = {
  ok?: boolean;
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

type AdminSection = 'dashboard' | 'menu' | 'users' | 'settings';

const DEFAULT_MENU_FORM: MenuFormState = {
  nombre: '',
  descripcion: '',
  categoria: 'Platos',
  precio: '',
};

const FALLBACK_CATEGORIES = ['Platos', 'Bebidas', 'Postres', 'Especiales'];
const ADMIN_NAV_ITEMS: Array<{ id: AdminSection; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
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

export default function AdminMobileScreen() {
  const { session, logout } = useMobileAuth();
  const { theme } = useMobileTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<MenuFormState>(DEFAULT_MENU_FORM);

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

  const handleCreateMenuItem = useCallback(async () => {
    const precio = Number.parseFloat(form.precio.replace(',', '.'));

    if (!form.nombre.trim() || !form.categoria.trim() || !Number.isFinite(precio) || precio < 0) {
      setErrorMessage('Debes completar nombre, categoría y precio válido.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await requestJson('/api/admin/menu', {
        method: 'POST',
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim(),
          categoria: form.categoria.trim(),
          precio,
        }),
      });

      setForm(DEFAULT_MENU_FORM);
      setIsModalVisible(false);
      await loadAdminData(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo crear el plato.');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, loadAdminData, requestJson]);

  if (!session) {
    return null;
  }

  const activeSectionLabel = ADMIN_NAV_ITEMS.find((item) => item.id === activeSection)?.label || 'Dashboard';
  const activeSectionDescription =
    activeSection === 'dashboard'
      ? 'Ventas, ocupación y tasas en un espacio enfocado para métricas clave.'
      : activeSection === 'menu'
        ? 'Gestiona el menú publicado y registra platos nuevos desde el móvil.'
        : activeSection === 'users'
          ? 'Consulta el estado del personal y su disponibilidad operativa.'
          : 'Consulta tasas activas y estado de la sesión administrativa.';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ADMIN MOBILE</Text>
          <Text style={styles.title}>{activeSectionLabel}</Text>
          <Text style={styles.subtitle}>Bienvenido, {session.nombre || session.usuario}. {activeSectionDescription}</Text>
        </View>
        <View style={styles.headerActions}>
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
                      menuItems.map((item) => (
                        <View key={item.id} style={styles.listCard}>
                          <View style={styles.listCardTopRow}>
                            <Text style={styles.listCardTitle}>{item.nombre}</Text>
                            <Text style={styles.priceTag}>{formatCurrency(item.precio)}</Text>
                          </View>
                          <Text style={styles.listCardMeta}>{item.categoria}</Text>
                          <Text style={styles.listCardDescription}>{item.descripcion || 'Sin descripción adicional.'}</Text>
                        </View>
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
                    <Text style={styles.sectionTitle}>Monitor de conexión</Text>
                  </View>
                  <Text style={styles.sectionMeta}>{staff.length} usuarios</Text>
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
                        <Text style={styles.staffStatus}>{member.isOnline ? 'Conectado' : 'Desconectado'}</Text>
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
            <Pressable style={styles.fab} onPress={() => setIsModalVisible(true)}>
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

      <Modal visible={isModalVisible} animationType="slide" transparent onRequestClose={() => setIsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>NUEVO PLATO</Text>
            <Text style={styles.modalTitle}>Alta rápida de menú</Text>

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
              <Pressable style={styles.ghostButton} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.ghostButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]} onPress={() => void handleCreateMenuItem()} disabled={isSubmitting}>
                {isSubmitting ? <ActivityIndicator size="small" color={theme.text.onAccent} /> : <Text style={styles.primaryButtonText}>Guardar</Text>}
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
    listCard: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.subtle,
      backgroundColor: theme.surface.card,
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
      color: theme.text.onAccent,
      backgroundColor: theme.accent.primary,
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      fontSize: 12,
      fontWeight: '700',
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border.strong,
      backgroundColor: theme.surface.card,
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
  });