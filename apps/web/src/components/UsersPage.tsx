import { activeLocale } from '../i18n/runtime';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Avatar,
  Box,
  Chip,
  FormControlLabel,
  Switch as MuiSwitch,
  TextField,
} from '@mui/material';
import {
  UsersRound,
  Search,
  Crown,
  Edit3,
  Ban,
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type { CoreUser, CoreRole, CorePermission, UserStatus } from '../types';

// Palette of beautiful neon gradients for initial-based user avatars
function getAvatarGradient(name: string) {
  const gradients = [
    'linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)', // Coral sunset
    'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)', // Royal indigo
    'linear-gradient(135deg, #10b981 0%, #34d399 100%)', // Fresh mint
    'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)', // Rose cosmos
    'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)', // Lavender spark
    'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)', // Electric cyan
    'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', // Warm amber
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return gradients[sum % gradients.length];
}

function displayUserName(user: Pick<CoreUser, 'firstName' | 'lastName' | 'email'>) {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return fullName || user.email;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = { ADMIN: 'Administrateur', SUPER_ADMIN: 'Administrateur', MANAGER: 'Manager', USER: 'Utilisateur' };
  return labels[role] ?? role;
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = { ACTIVE: 'Actif', INVITED: 'Invité', DISABLED: 'Désactivé' };
  return labels[status ?? ''] ?? status ?? '—';
}

function formatLastLogin(value?: string | null) {
  if (!value) return 'Jamais connecté';
  return new Date(value).toLocaleString(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

function normalizePermission(permission: CorePermission | string): CorePermission {
  return typeof permission === 'string' ? { key: permission, label: permission } : permission;
}

function roleKey(role: CoreRole) {
  return role.name ?? role.label ?? role.key ?? role.id ?? 'role';
}

function roleValue(role: CoreRole) {
  return role.name ?? role.label ?? role.key ?? '';
}

function permissionKey(permission: string | CorePermission) {
  return typeof permission === 'string' ? permission : permission.key;
}

export function UsersPage({
  users,
  roles,
  permissions,
  currentUserId,
  loading,
  onEdit,
  onDisable,
  onUpdateRolePermissions,
}: {
  users: CoreUser[];
  roles: CoreRole[];
  permissions: CorePermission[];
  currentUserId: string;
  loading: boolean;
  onEdit: (user: CoreUser) => void;
  onDisable: (user: CoreUser) => void;
  onUpdateRolePermissions: (roleKey: string, permissions: string[]) => Promise<void>;
}) {
  const [activeSubTab, setActiveSubTab] = useState<'members' | 'permissions'>('members');
  const viewMode = 'grid' as 'table' | 'grid';
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const visibleUsers = useMemo(() => {
    return users.filter((user) => {
      const haystack = `${displayUserName(user)} ${user.email}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesStatus = !statusFilter || user.status === statusFilter;
      const matchesRole = !roleFilter || [user.role, roleLabel(user.role)].includes(roleFilter);
      return matchesQuery && matchesStatus && matchesRole;
    });
  }, [users, query, statusFilter, roleFilter]);

  const permissionList = useMemo(() => {
    return permissions.length
      ? permissions.map(normalizePermission)
      : [
          { key: 'users.manage', label: 'Gérer les utilisateurs', module: 'Core' },
          { key: 'roles.manage', label: 'Gérer les rôles et permissions', module: 'Core' },
          { key: 'apps.manage', label: 'Gérer les applications', module: 'Core' },
          { key: 'stocks.read', label: 'Consulter les stocks', module: 'Stocks' },
          { key: 'stocks.write', label: 'Modifier les stocks', module: 'Stocks' },
        ];
  }, [permissions]);

  // Statistics counters for premium widgets
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'ACTIVE').length;
    const invited = users.filter((u) => u.status === 'INVITED').length;
    const admins = users.filter((u) => u.role === 'ADMIN').length;
    return { total, active, invited, admins };
  }, [users]);

  return (
    <div className="users-page-modern">
      {/* Header section with modern background */}
      <section className="welcome-hero users-hero-modern">
        <div className="hero-modern-overlay"></div>
        <div className="hero-modern-content">
          <span className="welcome-tag-modern">
            <UsersRound size={14} /> Administration & Accès
          </span>
          <h1>Utilisateurs & Permissions</h1>
          <p>Supervisez les accès de votre cuisine, configurez les permissions et gérez les rôles d'équipe.</p>
        </div>
      </section>

      {/* Sub-tab navigation */}
      <div className="users-tab-navigation">
        <button
          className={`users-tab-btn ${activeSubTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('members')}
        >
          <UsersRound size={16} />
          Membres & Accès
          <span className="tab-badge">{stats.total}</span>
        </button>
        <button
          className={`users-tab-btn ${activeSubTab === 'permissions' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('permissions')}
        >
          <ShieldCheck size={16} />
          Rôles & Habilitations
          <span className="tab-badge">{roles.length}</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'members' ? (
          <motion.div
            key="members-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="tab-content-wrapper"
          >

            {/* Actions & Filters Panel */}
            <div className="card-modern-premium filter-panel">
              <div className="filter-header-row">
                <div className="filter-title-group">
                  <h3>Membres de l'organisation</h3>
                  <p>Filtrez, recherchez et effectuez des actions rapides sur les accès de l'instance.</p>
                </div>
              </div>

              <div className="filter-inputs-row">
                <div className="search-input-wrapper-premium">
                  <Search size={16} />
                  <input
                    type="text"
                    className="search-input-premium"
                    placeholder="Rechercher par nom, prénom ou email..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="select-filters-group">
                  <select
                    className="select-premium"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    <option value="">Tous les rôles</option>
                    {roles.map((role) => (
                      <option key={roleKey(role)} value={roleValue(role)}>
                        {role.label ?? role.name ?? roleLabel(roleValue(role))}
                      </option>
                    ))}
                  </select>

                  <select
                    className="select-premium"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">Tous les statuts</option>
                    <option value="ACTIVE">Actif</option>
                    <option value="INVITED">Invité</option>
                    <option value="DISABLED">Désactivé</option>
                  </select>

                </div>
              </div>

              {/* Data list state */}
              {loading ? (
                <div className="loading-state-modern">
                  <div className="loading-spinner"></div>
                  <span>Chargement des collaborateurs...</span>
                </div>
              ) : null}

              {!loading && users.length === 0 ? (
                <div className="empty-state-modern">
                  <div className="empty-icon-wrapper">👥</div>
                  <h4>Aucun utilisateur configuré</h4>
                  <p>Créez un collaborateur depuis l’espace RH pour lui ajouter un accès ToqueHub.</p>
                </div>
              ) : null}

              {!loading && users.length > 0 && visibleUsers.length === 0 ? (
                <div className="empty-state-modern">
                  <div className="empty-icon-wrapper">🔎</div>
                  <h4>Aucun résultat trouvé</h4>
                  <p>Ajustez vos filtres ou votre recherche pour trouver d'autres collaborateurs.</p>
                </div>
              ) : null}

              {/* Views */}
              {!loading && visibleUsers.length > 0 && (
                <div className="view-container">
                  {viewMode === 'table' ? (
                    <div className="table-premium-wrapper">
                      <table className="table-premium">
                        <thead>
                          <tr>
                            <th>Collaborateur</th>
                            <th>Email</th>
                            <th>Rôle</th>
                            <th>Statut</th>
                            <th>Dernière Connexion</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleUsers.map((user) => {
                            const isCurrentUser = user.id === currentUserId;
                            const protectedAdmin = user.isPrimaryAdmin || (isCurrentUser && user.isPrimaryAdmin);
                            const initials = displayUserName(user).slice(0, 2).toUpperCase();
                            const avatarGrad = getAvatarGradient(displayUserName(user));

                            return (
                              <tr key={user.id} className="table-row-premium">
                                <td>
                                  <div className="user-profile-cell">
                                    <div className="avatar-premium" style={{ background: avatarGrad }}>
                                      {initials}
                                    </div>
                                    <div className="user-name-group">
                                      <span className="user-fullname">
                                        {displayUserName(user)}
                                        {isCurrentUser && <span className="me-badge">Moi</span>}
                                      </span>
                                      {protectedAdmin && (
                                        <span className="crown-badge">
                                          <Crown size={10} /> Admin principal
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="user-email-text">{user.email}</span>
                                </td>
                                <td>
                                  <span className={`role-badge-premium ${user.role.toLowerCase()}`}>
                                    {roleLabel(user.role)}
                                  </span>
                                </td>
                                <td>
                                  <div className="status-badge-container">
                                    <span className={`status-badge-glow ${user.status.toLowerCase()}`}>
                                      <span className="status-dot"></span>
                                      {statusLabel(user.status)}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span className="user-last-login">
                                    {formatLastLogin(user.lastLoginAt)}
                                  </span>
                                </td>
                                <td>
                                  <div className="actions-cell-group">
                                    <button
                                      className="btn-action-premium btn-edit-premium"
                                      onClick={() => onEdit(user)}
                                      title="Modifier"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                    <button
                                      className="btn-action-premium btn-disable-premium"
                                      onClick={() => onDisable(user)}
                                      disabled={protectedAdmin || user.status === 'DISABLED'}
                                      title="Désactiver"
                                    >
                                      <Ban size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid-premium-wrapper">
                      {visibleUsers.map((user) => {
                        const isCurrentUser = user.id === currentUserId;
                        const protectedAdmin = user.isPrimaryAdmin || (isCurrentUser && user.isPrimaryAdmin);
                        const initials = displayUserName(user).slice(0, 2).toUpperCase();
                        const avatarGrad = getAvatarGradient(displayUserName(user));

                        return (
                          <div key={user.id} className="user-grid-card">
                            <div className="card-header-gradient" style={{ background: avatarGrad }}>
                              {protectedAdmin && (
                                <span className="grid-crown-badge">
                                  <Crown size={12} /> Admin principal
                                </span>
                              )}
                              {isCurrentUser && <span className="grid-me-badge">Moi</span>}
                            </div>
                            <div className="grid-card-body">
                              <div className="grid-avatar-container">
                                <div className="grid-avatar" style={{ background: avatarGrad }}>
                                  <span aria-hidden={Boolean(user.collaboratorPhotoUrl)}>{initials}</span>
                                  {user.collaboratorPhotoUrl ? (
                                    <img
                                      className="grid-avatar-photo"
                                      src={user.collaboratorPhotoUrl}
                                      alt={`Photo de ${displayUserName(user)}`}
                                      referrerPolicy="no-referrer"
                                      onError={(event) => event.currentTarget.remove()}
                                    />
                                  ) : null}
                                </div>
                              </div>
                              <h4 className="grid-user-fullname">{displayUserName(user)}</h4>
                              <p className="grid-user-email">{user.email}</p>
                              
                              <div className="grid-meta-row">
                                <span className={`role-badge-premium ${user.role.toLowerCase()}`}>
                                  {roleLabel(user.role)}
                                </span>
                                <span className={`status-badge-glow ${user.status.toLowerCase()}`}>
                                  <span className="status-dot"></span>
                                  {statusLabel(user.status)}
                                </span>
                              </div>

                              <div className="grid-login-info">
                                <Clock size={12} />
                                <span>{formatLastLogin(user.lastLoginAt)}</span>
                              </div>
                            </div>
                            <div className="grid-card-footer">
                              <button
                                className="grid-footer-btn edit"
                                onClick={() => onEdit(user)}
                              >
                                <Edit3 size={13} /> Modifier
                              </button>
                              <button
                                className="grid-footer-btn disable"
                                onClick={() => onDisable(user)}
                                disabled={protectedAdmin || user.status === 'DISABLED'}
                              >
                                <Ban size={13} /> Désactiver
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="permissions-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="tab-content-wrapper"
          >
            <div className="card-modern-premium">
              <div className="filter-header-row" style={{ borderBottom: '1px solid var(--light-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div className="filter-title-group">
                  <span className="card-title-premium-badge">
                    <Shield size={16} /> Rôles de sécurité
                  </span>
                  <h3>Permissions applicables</h3>
                  <p>Les rôles de l'instance ToqueHub confèrent des privilèges distincts aux managers et équipiers.</p>
                </div>
              </div>
              
              <div className="permission-role-grid-modern">
                {roles.map((role) => (
                  <RolePermissionCard
                    key={roleKey(role)}
                    role={role}
                    permissions={permissionList}
                    onSave={onUpdateRolePermissions}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-component for individual role permissions config card
function RolePermissionCard({
  role,
  permissions,
  onSave,
}: {
  role: CoreRole;
  permissions: CorePermission[];
  onSave: (roleKey: string, permissions: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(role.permissions.map(permissionKey));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSelected(role.permissions.map(permissionKey));
  }, [role.permissions]);

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, CorePermission[]> = {};
    permissions.forEach((perm) => {
      const moduleName = perm.module || 'Core (Plateforme)';
      if (!groups[moduleName]) {
        groups[moduleName] = [];
      }
      groups[moduleName].push(perm);
    });
    return groups;
  }, [permissions]);

  async function save() {
    setSaving(true);
    setSuccess(false);
    try {
      await onSave(roleValue(role), selected);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  const handleToggle = (key: string, checked: boolean) => {
    setSelected((current) =>
      checked ? [...new Set([...current, key])] : current.filter((k) => k !== key)
    );
  };

  return (
    <div className="permission-role-card-modern">
      <div className="role-card-header-modern">
        <h4 className="role-card-title">{role.label ?? role.name ?? roleLabel(roleValue(role))}</h4>
        <p className="role-card-desc">{role.description ?? 'Permissions de sécurité applicables au rôle.'}</p>
      </div>

      <div className="role-card-permissions-list">
        {Object.entries(groupedPermissions).map(([moduleName, perms]) => (
          <div key={moduleName} className="permission-module-group">
            <span className="permission-group-title">{moduleName}</span>
            <div className="permission-switches-stack">
              {perms.map((permission) => {
                const key = permission.key;
                const isChecked = selected.includes(key);
                return (
                  <div key={key} className="permission-switch-row">
                    <div className="permission-switch-label-group">
                      <span className="permission-switch-name">{permission.label ?? key}</span>
                      <small className="permission-switch-key">{key}</small>
                    </div>
                    <FormControlLabel
                      control={
                        <MuiSwitch
                          size="small"
                          checked={isChecked}
                          onChange={(e) => handleToggle(key, e.target.checked)}
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: 'var(--primary)',
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: 'var(--primary)',
                            },
                          }}
                        />
                      }
                      label=""
                      labelPlacement="start"
                      style={{ marginRight: 0 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="role-card-footer-modern">
        <button
          className={`btn-modern btn-save-permissions ${success ? 'btn-save-success' : ''}`}
          onClick={save}
          disabled={saving}
        >
          {saving ? (
            <>
              <div className="spinner-save"></div> Enregistrement...
            </>
          ) : success ? (
            <>
              <CheckCircle2 size={14} /> Enregistré !
            </>
          ) : (
            'Enregistrer les permissions'
          )}
        </button>
      </div>
    </div>
  );
}

// Modernized form for creating or editing a user
export function UserForm({
  user,
  roles,
  initialValues,
  fromHrCollaborator = false,
  onSubmitCreate,
  onSubmitUpdate,
  onClose,
}: {
  user?: CoreUser;
  roles: CoreRole[];
  initialValues?: { firstName: string; lastName: string; email: string };
  fromHrCollaborator?: boolean;
  onSubmitCreate?: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    temporaryPassword: string;
  }) => Promise<void>;
  onSubmitUpdate?: (payload: {
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
    status?: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(user?.firstName ?? initialValues?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? initialValues?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? initialValues?.email ?? '');
  const [role, setRole] = useState(user?.role ?? (fromHrCollaborator ? 'Utilisateur' : roles[0] ? roleValue(roles[0]) : 'Utilisateur'));
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'INVITED');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const primaryAdmin = Boolean(user?.isPrimaryAdmin);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      if (user && onSubmitUpdate) {
        await onSubmitUpdate({
          firstName,
          lastName,
          email,
          role: primaryAdmin ? undefined : role,
          status: primaryAdmin ? undefined : status,
        });
      } else if (onSubmitCreate) {
        await onSubmitCreate({ firstName, lastName, email, role, temporaryPassword });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="user-form-premium">
      <Box sx={{ display: 'grid', gap: '1.25rem' }}>
        {fromHrCollaborator && !user ? (
          <div className="alert-modern-premium alert-success">
            <CheckCircle2 size={16} />
            <span>La fiche collaborateur est enregistrée. Créez maintenant son compte d’accès ToqueHub ; aucune nouvelle fiche RH ne sera ajoutée.</span>
          </div>
        ) : null}
        {error && (
          <div className="alert-modern-premium alert-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {primaryAdmin && (
          <div className="alert-modern-premium alert-success">
            <Crown size={16} />
            <span>Administrateur principal : rôle et statut système verrouillés.</span>
          </div>
        )}

        <div className="form-double-row">
          <TextField
            label="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            fullWidth
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px',
                '&.Mui-focused fieldset': {
                  borderColor: 'var(--primary)',
                },
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: 'var(--primary)',
              },
            }}
          />
          <TextField
            label="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            fullWidth
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px',
                '&.Mui-focused fieldset': {
                  borderColor: 'var(--primary)',
                },
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: 'var(--primary)',
              },
            }}
          />
        </div>

        <TextField
          label="Adresse email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
          variant="outlined"
          size="small"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              '&.Mui-focused fieldset': {
                borderColor: 'var(--primary)',
              },
            },
            '& .MuiInputLabel-root.Mui-focused': {
              color: 'var(--primary)',
            },
          }}
        />

        <div className="form-row-premium">
          <label className="select-label-premium">
            Rôle sur la plateforme
            <select
              className="select-premium full-width"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={primaryAdmin}
            >
              {roles.map((r) => (
                <option key={roleKey(r)} value={roleValue(r)}>
                  {r.label ?? r.name ?? roleLabel(roleValue(r))}
                </option>
              ))}
            </select>
          </label>
        </div>

        {user ? (
          <div className="form-row-premium">
            <label className="select-label-premium">
              Statut du compte
              <select
                className="select-premium full-width"
                value={status}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
                disabled={primaryAdmin}
              >
                <option value="ACTIVE">Actif</option>
                <option value="INVITED">Invité (En attente)</option>
                <option value="DISABLED">Désactivé</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="form-row-premium">
            <TextField
              label="Mot de passe temporaire"
              type="password"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              required
              fullWidth
              variant="outlined"
              size="small"
              helperText="Secret temporaire. Par sécurité, il ne sera plus réaffiché après création."
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  '&.Mui-focused fieldset': {
                    borderColor: 'var(--primary)',
                  },
                },
                '& .MuiInputLabel-root.Mui-focused': {
                  color: 'var(--primary)',
                },
                '& .MuiFormHelperText-root': {
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                },
              }}
            />
          </div>
        )}
      </Box>

      <div className="modal-footer-premium">
        <button
          type="button"
          className="btn-modern btn-modern-secondary"
          onClick={onClose}
          disabled={submitting}
        >
          Annuler
        </button>
        <button type="submit" className="btn-modern btn-modern-primary" disabled={submitting}>
          {submitting ? 'Enregistrement...' : user ? 'Enregistrer les modifications' : 'Créer l’utilisateur'}
        </button>
      </div>
    </form>
  );
}
