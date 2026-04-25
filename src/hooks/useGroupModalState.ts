import { useState, useEffect } from 'react'
import type { GroupItem } from './groupManagerState'

interface UseGroupModalStateOptions {
    groups: GroupItem[]
    showInfoDialog: (message: string) => void
}

export function useGroupModalState({ groups, showInfoDialog }: UseGroupModalStateOptions) {
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')
    const [showManageGroupModal, setShowManageGroupModal] = useState(false)
    const [manageSourceGroupId, setManageSourceGroupId] = useState('')
    const [manageTargetGroupId, setManageTargetGroupId] = useState('')

    // Sync manage modal group selectors when groups change
    useEffect(() => {
        if (groups.length > 0) {
            if (!manageSourceGroupId || !groups.some((g) => g.id === manageSourceGroupId)) {
                setManageSourceGroupId(groups[0].id)
            }
            if (!manageTargetGroupId || !groups.some((g) => g.id === manageTargetGroupId)) {
                setManageTargetGroupId(groups[0].id)
            }
        } else {
            setManageSourceGroupId('')
            setManageTargetGroupId('')
        }
    }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

    const openCreateGroupModal = (defaultName: string) => {
        setNewGroupName(defaultName)
        setShowCreateGroupModal(true)
    }

    const openManageGroupModal = () => {
        if (groups.length === 0) {
            showInfoDialog('当前没有分组，请先新建分组。')
            return
        }
        setShowManageGroupModal(true)
    }

    return {
        showCreateGroupModal, setShowCreateGroupModal,
        newGroupName, setNewGroupName,
        showManageGroupModal, setShowManageGroupModal,
        manageSourceGroupId, setManageSourceGroupId,
        manageTargetGroupId, setManageTargetGroupId,
        openCreateGroupModal,
        openManageGroupModal,
    }
}
