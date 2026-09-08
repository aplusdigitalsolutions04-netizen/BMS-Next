'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Client Master"
      description="Manage clients used in Direct Link entries"
      items={state.clients}
      onAdd={(item) => handleMasterUpdate('add', 'CLIENT', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'CLIENT', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'CLIENT', id)}
      showDescription={false}
    />
  )
}
