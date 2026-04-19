import type { GroupItem } from '../../hooks/groupManagerState'
import styles from './LibraryView.module.css'

// ─── 新建分组弹窗 ───────────────────────────────────

interface CreateGroupModalProps {
    newGroupName: string
    setNewGroupName: (v: string) => void
    onClose: () => void
    onCreate: () => void
}

export const CreateGroupModal = ({ newGroupName, setNewGroupName, onClose, onCreate }: CreateGroupModalProps) => (
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
                    value={newGroupName}
                    onChange={(event) => setNewGroupName(event.target.value)}
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

interface ManageGroupModalProps {
    groups: GroupItem[]
    manageSourceGroupId: string
    setManageSourceGroupId: (v: string) => void
    manageTargetGroupId: string
    setManageTargetGroupId: (v: string) => void
    onClose: () => void
    onRename: (groupId: string, name: string) => void
    onDissolve: (groupId: string) => void
    onMoveBooks: (from: string, to: string) => void
}

export const ManageGroupModal = ({
    groups,
    manageSourceGroupId,
    setManageSourceGroupId,
    manageTargetGroupId,
    setManageTargetGroupId,
    onClose,
    onRename,
    onDissolve,
    onMoveBooks,
}: ManageGroupModalProps) => (
    <div className={styles.settingsModalOverlay} onClick={onClose}>
        <div className={styles.dialogPanel} onClick={(event) => event.stopPropagation()}>
            <div className={styles.settingsHeader}>
                <h3>管理分组</h3>
                <button className={styles.closeBtn} onClick={onClose}>×</button>
            </div>
            <div className={styles.manageGroupList}>
                {groups.map((group) => (
                    <div key={group.id} className={styles.manageGroupRow}>
                        <input
                            className={styles.textInput}
                            defaultValue={group.name}
                            onBlur={(event) => onRename(group.id, event.target.value)}
                        />
                        <button className={styles.smallBtn} onClick={() => onDissolve(group.id)}>解散</button>
                    </div>
                ))}
            </div>
            {groups.length > 1 && (
                <div className={styles.manageMovePanel}>
                    <label className={styles.settingRow}>
                        <span>来源分组</span>
                        <select value={manageSourceGroupId} onChange={(event) => setManageSourceGroupId(event.target.value)}>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className={styles.settingRow}>
                        <span>目标分组</span>
                        <select value={manageTargetGroupId} onChange={(event) => setManageTargetGroupId(event.target.value)}>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                    </label>
                    <div className={styles.rowActions}>
                        <button className={styles.syncPrimaryBtn} onClick={() => onMoveBooks(manageSourceGroupId, manageTargetGroupId)}>
                            移动全部图书到目标分组
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
)
