import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Mutação manual da interface. Depois de qualquer alteração, invalida todas as consultas:
 * o app é pequeno e uma edição pode afetar várias telas (atividade -> rotina -> dashboard -> kanban).
 */
export function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, onDone?: (result: TResult) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result: TResult) => {
      await qc.invalidateQueries();
      onDone?.(result);
    },
  });
}
