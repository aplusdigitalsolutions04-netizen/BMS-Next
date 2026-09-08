'use client'
import { useApp } from '@/src/store/AppContext'
import MasterManager from '@/src/components/Masters/MasterManager'
import { useMasterUpdate } from '@/src/hooks/useMasterUpdate'

export default function Page() {
  const { state } = useApp()
  const handleMasterUpdate = useMasterUpdate()
  return (
    <MasterManager
      title="Tag Master"
      description="Manage reusable document tags"
      items={state.tags}
      onAdd={(item) => handleMasterUpdate('add', 'DOC_TAG', item)}
      onUpdate={(item) => handleMasterUpdate('update', 'DOC_TAG', item)}
      onDelete={(id) => handleMasterUpdate('delete', 'DOC_TAG', id)}
      showColor
      showDescription={false}
    />
  )
}
