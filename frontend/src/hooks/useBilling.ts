import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { billingService } from '@/services/billing.service'

const KEYS_QUERY = 'api-keys'
const BILLING_QUERY = 'billing-stats'

export function useApiKeys() {
  return useQuery({
    queryKey: [KEYS_QUERY],
    queryFn: () => billingService.listApiKeys(),
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => billingService.createApiKey(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS_QUERY] }),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => billingService.revokeApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEYS_QUERY] })
      qc.invalidateQueries({ queryKey: [BILLING_QUERY] })
    },
  })
}

export function useBillingStats() {
  return useQuery({
    queryKey: [BILLING_QUERY],
    queryFn: () => billingService.getBillingStats(),
    staleTime: 60_000,
  })
}
