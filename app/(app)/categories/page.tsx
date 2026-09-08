'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Document Categories"
      description="Manage document categories like GST, PAN, Agreements, etc."
      items={state.categories}
      onAdd={(item) => handleMasterUpdate('add', 'DOC_CATEGORY', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'DOC_CATEGORY', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'DOC_CATEGORY', id)}
      showDescription
    />
  )
}
