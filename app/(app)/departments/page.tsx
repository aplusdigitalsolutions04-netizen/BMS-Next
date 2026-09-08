'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Departments"
      description="Manage organizational departments"
      items={state.departments}
      onAdd={(item) => handleMasterUpdate('add', 'DOC_DEPARTMENT', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'DOC_DEPARTMENT', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'DOC_DEPARTMENT', id)}
      showDescription
    />
  )
}
