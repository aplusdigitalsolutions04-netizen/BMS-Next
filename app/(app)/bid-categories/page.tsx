'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Bid Category Master"
      description="Manage bid categories — IT Equipment, Services, Medical, etc."
      items={state.bidCategories}
      onAdd={(item) => handleMasterUpdate('add', 'BID_CATEGORY', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'BID_CATEGORY', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'BID_CATEGORY', id)}
      showDescription={false}
    />
  )
}
