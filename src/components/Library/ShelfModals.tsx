import type { GroupItem } from '../../hooks/groupManagerState'
import styles from './LibraryView.module.css'

// ─── 新建分组弹窗 ───────────────────────────────────

interface CreateShelfModalProps {
    newShelfName: string
    setNewShelfName: (v: string) => void
    onClose: () => void
    onCreate: () => void
}

export const CreateShelfModal = ({ newShelfName, setNewShelfName, onClose, onCreate }: CreateShelfModalProps) => (
    <div className={styles.settingsModalOverlay} onClick={onClose}>
        <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
            <div className={styles.settingsHeader}>
                <h3>新建分组</h3>
                <button className={styles.closeBtn} onClick={onClose}>×</button>
            </div>
            <label className={styles.settingRow}>
                <span>分组名称</span>
                <input
                    className={styles.textInput}
                    type="text"
                    value={newShelfName}
                    onChange={(event) => setNewShelfName(event.target.value)}
                />
            </label>
            <div className={styles.rowActions}>
                <button className={styles.smallBtn} onClick={onClose}>取消</button>
                <button className={styles.syncPrimaryBtn} onClick={onCreate}>创建</button>
            </div>
        </div>
    </div>
)

// ─── 管理分组弹窗 ───────────────────────────────────

interface ManageShelfModalProps {
    shelves: GroupItem[]
    manageSourceShelfId: string
    setManageSourceShelfId: (v: string) => void
    manageTargetShelfId: string
    setManageTargetShelfId: (v: string) => void
    onClose: () => void
    onRename: (shelfId: string, name: string) => void
    onDissolve: (shelfId: string) => void
    onMoveBooks: (from: string, to: string) => void
}

export const ManageShelfModal = ({
    shelves,
    manageSourceShelfId,
    setManageSourceShelfId,
    manageTargetShelfId,
    setManageTargetShelfId,
    onClose,
    onRename,
    onDissolve,
    onMoveBooks,
}: ManageShelfModalProps) => (
    <div className={styles.settingsModalOverlay} onClick={onClose}>
        <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
            <div className={styles.settingsHeader}>
                <h3>管理分组</h3>
                <button className={styles.closeBtn} onClick={onClose}>×</button>
            </div>
            <div className={styles.manageShelfList}>
                {shelves.map((shelf) => (
                    <div key={shelf.id} className={styles.manageShelfRow}>
                        <input
                            className={styles.textInput}
                            defaultValue={shelf.name}
                            onBlur={(event) => onRename(shelf.id, event.target.value)}
                        />
                        <button className={styles.smallBtn} onClick={() => onDissolve(shelf.id)}>解散</button>
                    </div>
                ))}
            </div>
            {shelves.length > 1 && (
                <div className={styles.manageMovePanel}>
                    <label className={styles.settingRow}>
                        <span>来源分组</span>
                        <select value={manageSourceShelfId} onChange={(event) => setManageSourceShelfId(event.target.value)}>
                            {shelves.map((shelf) => (
                                <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.settingRow}>
                        <span>目标分组</span>
                        <select value={manageTargetShelfId} onChange={(event) => setManageTargetShelfId(event.target.value)}>
                            {shelves.map((shelf) => (
                                <option key={shelf.id} value={shelf.id}>{shelf.name}</option>
                            ))}
                        </select>
                    </label>
                    <div className={styles.rowActions}>
                        <button className={styles.syncPrimaryBtn} onClick={() => onMoveBooks(manageSourceShelfId, manageTargetShelfId)}>
                            移动全部图书到目标分组
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
)
