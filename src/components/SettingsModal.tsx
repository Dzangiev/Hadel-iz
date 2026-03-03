import { useState, useEffect } from 'react';
import { Settings, X, Monitor, Moon, Sun, Download, Upload, Trash2, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../db/useAuth';
import { signInWithGoogle, logout, auth, dbFirestore } from '../db/firebase';
import { db } from '../db/db';
import { markReset } from '../db/sync';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { clsx } from 'clsx';
import { useSheetClose } from './useSheetClose';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isExtraMode: boolean;
    onExtraModeChange: (val: boolean) => void;
}

type Theme = 'system' | 'light' | 'dark';

export function SettingsModal({ isOpen, onClose, isExtraMode, onExtraModeChange }: SettingsModalProps) {
    const [theme, setTheme] = useState<Theme>('system');
    const { user } = useAuth();
    const { isClosing, requestClose, handleAnimationEnd } = useSheetClose(isOpen, onClose);

    // Load theme on mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('app-theme') as Theme | null;
        if (savedTheme) {
            setTheme(savedTheme);
            applyTheme(savedTheme);
        } else {
            applyTheme('system');
        }
    }, [isOpen]);

    const applyTheme = (newTheme: Theme) => {
        if (newTheme === 'system') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', newTheme);
        }
    };

    const handleThemeChange = (newTheme: Theme) => {
        setTheme(newTheme);
        localStorage.setItem('app-theme', newTheme);
        applyTheme(newTheme);
    };

    const handleLogin = async () => {
        try {
            await signInWithGoogle();
        } catch (e) {
            console.error(e);
            alert('Не удалось войти');
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (e) {
            console.error(e);
        }
    };

    const handleReset = async () => {
        if (confirm('Вы уверены, что хотите сбросить все данные? Это действие нельзя отменить.')) {
            // 1. Clear local Dexie DB
            await db.tasks.clear();
            await db.habits.clear();
            await db.rewards.clear();
            await db.user.update(1, { balance: 0 });

            // 2. Clear Firestore remote data for this user
            const uid = auth.currentUser?.uid;
            if (uid) {
                const cols = ['tasks', 'habits', 'rewards'];
                for (const colName of cols) {
                    const snap = await getDocs(collection(dbFirestore, 'users', uid, colName));
                    await Promise.all(snap.docs.map(d => deleteDoc(doc(dbFirestore, 'users', uid, colName, d.id))));
                }
                // Mark reset in Firestore so other devices know to wipe local data
                await markReset(uid);
            }

            // 3. Clear localStorage (keep theme)
            const savedTheme = localStorage.getItem('app-theme');
            localStorage.clear();
            if (savedTheme) localStorage.setItem('app-theme', savedTheme);

            window.location.reload();
        }
    };

    const handleExport = async () => {
        const data = {
            tasks: await db.tasks.toArray(),
            habits: await db.habits.toArray(),
            rewards: await db.rewards.toArray(),
            user: await db.user.toArray(),
            settings: {
                theme: localStorage.getItem('app-theme'),
                extraMode: localStorage.getItem('extra-mode')
            }
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hadel-iz-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (confirm('Это заменит все текущие данные данными из бэкапа. Продолжить?')) {
                    await db.transaction('rw', db.tasks, db.habits, db.rewards, db.user, async () => {
                        await db.tasks.clear();
                        await db.habits.clear();
                        await db.rewards.clear();
                        await db.user.clear();

                        if (data.tasks) await db.tasks.bulkAdd(data.tasks);
                        if (data.habits) await db.habits.bulkAdd(data.habits);
                        if (data.rewards) await db.rewards.bulkAdd(data.rewards);
                        if (data.user) await db.user.bulkAdd(data.user);
                    });

                    if (data.settings) {
                        if (data.settings.theme) localStorage.setItem('app-theme', data.settings.theme);
                        if (data.settings.extraMode) localStorage.setItem('extra-mode', data.settings.extraMode);
                    }
                    window.location.reload();
                }
            } catch (err) {
                alert('Ошибка при импорте файла. Проверьте формат.');
            }
        };
        reader.readAsText(file);
    };

    if (!isOpen) return null;

    return (
        <div className={`modal-overlay${isClosing ? ' closing' : ''}`} onClick={requestClose} onAnimationEnd={handleAnimationEnd}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-handle" />

                <div className="modal-title-row">
                    <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Settings size={20} />
                        Настройки
                    </span>
                    <button className="icon-btn modal-close" onClick={requestClose} style={{ position: 'absolute', right: 16 }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body" style={{ paddingBottom: 40 }}>
                    <div style={{ marginBottom: 32 }}>
                        <label className="input-label" style={{ marginBottom: '8px' }}>Аккаунт (Синхронизация)</label>
                        <div className="settings-group">
                            {user ? (
                                <>
                                    <div className="settings-row-btn" style={{ cursor: 'default' }}>
                                        {user.photoURL ? (
                                            <img src={user.photoURL} alt="Avatar" style={{ width: 28, height: 28, borderRadius: 6 }} />
                                        ) : (
                                            <div className="settings-row-icon" style={{ background: 'var(--ios-blue)', color: '#fff' }}>
                                                <UserIcon size={16} />
                                            </div>
                                        )}
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: 16, fontWeight: 500 }}>{user.displayName || 'Пользователь'}</span>
                                            <span style={{ fontSize: 13, color: 'var(--label-secondary)' }}>{user.email}</span>
                                        </div>
                                    </div>
                                    <button className="settings-row-btn" onClick={handleLogout} style={{ color: 'var(--ios-red)' }}>
                                        <div className="settings-row-icon" style={{ background: 'var(--fill-tertiary)', color: 'var(--ios-red)' }}>
                                            <LogOut size={16} />
                                        </div>
                                        <span style={{ flex: 1 }}>Выйти</span>
                                    </button>
                                </>
                            ) : (
                                <button className="settings-row-btn" onClick={handleLogin}>
                                    <div className="settings-row-icon" style={{ background: 'var(--ios-blue)', color: '#fff' }}>
                                        <LogIn size={16} />
                                    </div>
                                    <span style={{ flex: 1 }}>Войти с Google</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" style={{ marginBottom: '8px' }}>Тема оформления</label>
                        <div className="type-selector">
                            <button
                                type="button"
                                className={clsx('type-btn', theme === 'system' && 'active-task')}
                                onClick={() => handleThemeChange('system')}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                                <Monitor size={16} /> Системная
                            </button>
                            <button
                                type="button"
                                className={clsx('type-btn', theme === 'light' && 'active-task')}
                                onClick={() => handleThemeChange('light')}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                                <Sun size={16} /> Светлая
                            </button>
                            <button
                                type="button"
                                className={clsx('type-btn', theme === 'dark' && 'active-task')}
                                onClick={() => handleThemeChange('dark')}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                                <Moon size={16} /> Темная
                            </button>
                        </div>
                    </div>

                    <div className="input-group" style={{ marginTop: 24, padding: '16px', background: 'var(--fill-quaternary)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label className="input-label" style={{ marginBottom: '2px', paddingLeft: 0 }}>Режим ЭКСТРА</label>
                                <p style={{ fontSize: 12, color: 'var(--label-secondary)', maxWidth: '200px' }}>
                                    Позволяет балансу уходить в минус (убирает лимит в 0 монет)
                                </p>
                            </div>
                            <button
                                className={clsx('toggle-btn', isExtraMode && 'active')}
                                onClick={() => onExtraModeChange(!isExtraMode)}
                                style={{
                                    width: 51, height: 31, borderRadius: 15.5,
                                    background: isExtraMode ? 'var(--ios-green)' : 'var(--ios-gray4)',
                                    position: 'relative', border: 'none', transition: 'background 0.2s'
                                }}
                            >
                                <div style={{
                                    width: 27, height: 27, borderRadius: '50%', background: '#fff',
                                    position: 'absolute', top: 2, left: isExtraMode ? 22 : 2,
                                    transition: 'left 0.2s', boxShadow: '0 3px 8px rgba(0,0,0,0.15)'
                                }} />
                            </button>
                        </div>
                    </div>

                    <div style={{ marginTop: 32 }}>
                        <label className="input-label" style={{ marginBottom: '8px' }}>Данные и резервные копии</label>
                        <div className="settings-group">
                            <button className="settings-row-btn" onClick={handleExport}>
                                <div className="settings-row-icon" style={{ background: 'var(--ios-blue)', color: '#fff' }}>
                                    <Download size={16} />
                                </div>
                                <span style={{ flex: 1 }}>Экспорт данных</span>
                            </button>

                            <label className="settings-row-btn" style={{ margin: 0 }}>
                                <div className="settings-row-icon" style={{ background: 'var(--ios-blue)', color: '#fff' }}>
                                    <Upload size={16} />
                                </div>
                                <span style={{ flex: 1 }}>Импорт данных</span>
                                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                            </label>

                            <button className="settings-row-btn" onClick={handleReset} style={{ color: 'var(--ios-red)' }}>
                                <div className="settings-row-icon" style={{ background: 'var(--ios-red)', color: '#fff' }}>
                                    <Trash2 size={16} />
                                </div>
                                <span style={{ flex: 1 }}>Сбросить всё</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
