'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Document Statuses"
      description="Manage document status types"
      items={state.statuses}
      onAdd={(item) => handleMasterUpdate('add', 'DOC_STATUS', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'DOC_STATUS', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'DOC_STATUS', id)}
      showColor
      showDescription={false}
    />
  )
}
