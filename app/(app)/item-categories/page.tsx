'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Item Category Master"
      description="Manage item categories used in Direct Link entries"
      items={state.itemCategories}
      onAdd={(item) => handleMasterUpdate('add', 'ITEM_CATEGORY', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'ITEM_CATEGORY', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'ITEM_CATEGORY', id)}
      showDescription={false}
    />
  )
}
