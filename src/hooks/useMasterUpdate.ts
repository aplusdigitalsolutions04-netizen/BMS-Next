import axios from 'axios';
import toast from 'react-hot-toast';
import { useApp } from '../store/AppContext';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MasterItem = any;

// Shared by every masterdata-backed page (Categories, Departments, Tags, Statuses,
// Firm Types, Bid Categories, Item Categories, Client Master) -- each just passes its
// own groupCode and the matching SET_* action for the parsed list.
export function useMasterUpdate() {
  const { dispatch } = useApp();

  return async function handleMasterUpdate(
    action: 'add' | 'update' | 'delete',
    groupCode: string,
    itemOrId: MasterItem
  ) {
    try {
      if (action === 'add') {
        const item = itemOrId as Record<string, unknown>;
        await axios.post(`/api/master/${groupCode}`, {
          code: item.id,
          value: item.name,
          metadata: JSON.stringify({ description: item.description, color: item.color }),
        });
      } else if (action === 'update') {
        const item = itemOrId as Record<string, unknown>;
        await axios.put(`/api/master/${groupCode}/${item.id}`, {
          value: item.name,
          metadata: JSON.stringify({ description: item.description, color: item.color }),
        });
      } else if (action === 'delete') {
        await axios.delete(`/api/master/${groupCode}/${itemOrId}`);
      }

      const masterRes = await axios.get('/api/master');
      dispatch({ type: 'SET_MASTER_GROUPS', payload: masterRes.data });

      const parseMasterData = (code: string) => {
        const group = masterRes.data.find((g: { code: string }) => g.code === code);
        return group
          ? group.masterData.map((r: { code: string; value: string; metadata?: string; isActive: boolean }) => {
              let meta: Record<string, string> = {};
              try { if (r.metadata) meta = JSON.parse(r.metadata); } catch {}
              return {
                id: r.code,
                name: r.value,
                description: meta.description || '',
                color: meta.color || undefined,
                isActive: r.isActive,
                isDeleted: false,
                createdOn: '',
              };
            })
          : [];
      };

      dispatch({ type: 'SET_CATEGORIES', payload: parseMasterData('DOC_CATEGORY') });
      dispatch({ type: 'SET_DEPARTMENTS', payload: parseMasterData('DOC_DEPARTMENT') });
      dispatch({ type: 'SET_STATUSES', payload: parseMasterData('DOC_STATUS') });
      dispatch({ type: 'SET_TAGS', payload: parseMasterData('DOC_TAG') });
      dispatch({ type: 'SET_FIRM_TYPES', payload: parseMasterData('FIRM_TYPE') });
      dispatch({ type: 'SET_BID_CATEGORIES', payload: parseMasterData('BID_CATEGORY') });
      dispatch({ type: 'SET_ITEM_CATEGORIES', payload: parseMasterData('ITEM_CATEGORY') });
      dispatch({ type: 'SET_CLIENTS', payload: parseMasterData('CLIENT') });

      toast.success('Successfully saved');
    } catch (e) {
      // The API returns a specific message (e.g. a duplicate-name rejection from the
      // sp_masterdata_upsert stored procedure) when available -- show that instead of a
      // generic failure so the user knows *why*, not just that it failed.
      toast.error(axios.isAxiosError(e) && e.response?.data?.error ? e.response.data.error : 'Failed to save');
    }
  };
}
