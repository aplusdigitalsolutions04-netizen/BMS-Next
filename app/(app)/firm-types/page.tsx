'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Firm Type Master"
      description="Manage firm types — Proprietorship, LLP, Pvt Ltd, etc."
      items={state.firmTypes}
      onAdd={(item) => handleMasterUpdate('add', 'FIRM_TYPE', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'FIRM_TYPE', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'FIRM_TYPE', id)}
      showDescription={false}
    />
  )
}
