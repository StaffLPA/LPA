import { useGetTagCatalog } from '@workspace/api-client-react';
import { DEFAULT_TAG_CATALOG, type TagCatalog } from '@/constants/tagCatalog';

export function useTagCatalog() {
  const query = useGetTagCatalog({ query: { queryKey: ['/api/tag-catalog'], staleTime: 30_000, refetchOnWindowFocus: true, refetchInterval: 60_000 } });
  return { ...query, data: (query.data ?? DEFAULT_TAG_CATALOG) as TagCatalog };
}