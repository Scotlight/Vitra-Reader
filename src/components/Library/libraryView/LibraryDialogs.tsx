import { SettingsPanel } from '../SettingsPanel'
import { BookPropertiesModal } from '../BookPropertiesModal'
import { CreateGroupModal, ManageGroupModal } from '../GroupModals'
import type { BookMeta } from '@/services/storageService'
import type { GroupItem } from '@/hooks/groupManagerState'
import type { LibraryDialogState } from './useLibraryViewState'
import styles from '../LibraryView.module.css'

interface LibraryDialogsProps {
    systemFonts: string[]
    loadingFonts: boolean
    showSettings: boolean
    onCloseSettings: () => void
    books: BookMeta[]
    showBookPropertiesModal: string | null
    onCloseBookProperties: () => void
    onSavedBookProperties: () => Promise<void>
    showCreateGroupModal: boolean
    newGroupName: string
    setNewGroupName: (value: string) => void
    onCloseCreateGroupModal: () => void
    onCreateGroup: () => void
    showManageGroupModal: boolean
    groups: GroupItem[]
    manageSourceGroupId: string
    setManageSourceGroupId: (value: string) => void
    manageTargetGroupId: string
    setManageTargetGroupId: (value: string) => void
    onCloseManageGroupModal: () => void
    onRenameGroup: (id: string, name: string) => void
    onDissolveGroup: (id: string) => void
    onMoveGroupBooks: (from: string, to: string) => void
    dialogState: LibraryDialogState
    onCloseDialog: () => void
    onConfirmDialog: () => void
}

export function LibraryDialogs({
    systemFonts,
    loadingFonts,
    showSettings,
    onCloseSettings,
    books,
    showBookPropertiesModal,
    onCloseBookProperties,
    onSavedBookProperties,
    showCreateGroupModal,
    newGroupName,
    setNewGroupName,
    onCloseCreateGroupModal,
    onCreateGroup,
    showManageGroupModal,
    groups,
    manageSourceGroupId,
    setManageSourceGroupId,
    manageTargetGroupId,
    setManageTargetGroupId,
    onCloseManageGroupModal,
    onRenameGroup,
    onDissolveGroup,
    onMoveGroupBooks,
    dialogState,
    onCloseDialog,
    onConfirmDialog,
}: LibraryDialogsProps) {
    const selectedBook = showBookPropertiesModal
        ? books.find((item) => item.id === showBookPropertiesModal) ?? null
        : null

    return (
        <>
            {showSettings && (
                <SettingsPanel
                    systemFonts={systemFonts}
                    loadingFonts={loadingFonts}
                    onClose={onCloseSettings}
                />
            )}

            {selectedBook && (
                <BookPropertiesModal
                    book={selectedBook}
                    books={books}
                    onClose={onCloseBookProperties}
                    onSaved={onSavedBookProperties}
                />
            )}

            {showCreateGroupModal && (
                <CreateGroupModal
                    newGroupName={newGroupName}
                    setNewGroupName={setNewGroupName}
                    onClose={onCloseCreateGroupModal}
                    onCreate={onCreateGroup}
                />
            )}

            {showManageGroupModal && (
                <ManageGroupModal
                    groups={groups}
                    manageSourceGroupId={manageSourceGroupId}
                    setManageSourceGroupId={setManageSourceGroupId}
                    manageTargetGroupId={manageTargetGroupId}
                    setManageTargetGroupId={setManageTargetGroupId}
                    onClose={onCloseManageGroupModal}
                    onRename={onRenameGroup}
                    onDissolve={onDissolveGroup}
                    onMoveBooks={onMoveGroupBooks}
                />
            )}

            {dialogState.open && (
                <div className={styles.settingsModalOverlay} onClick={onCloseDialog}>
                    <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
                        <div className={styles.settingsHeader}>
                            <h3>{dialogState.title}</h3>
                            <button className={styles.closeBtn} onClick={onCloseDialog}>×</button>
                        </div>
                        <p className={styles.dialogMessage}>{dialogState.message}</p>
                        <div className={styles.rowActions}>
                            {dialogState.type === 'confirm' && (
                                <button className={styles.smallBtn} onClick={onCloseDialog}>{dialogState.cancelText}</button>
                            )}
                            <button className={styles.syncPrimaryBtn} onClick={onConfirmDialog}>{dialogState.confirmText}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
