import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Principle, PrincipleFolder, VaultStatus } from '../../api/types';

/**
 * Mesma chave de query do Cofre em Configurações > Perfil: desbloquear lá (ou aqui) reflete nos dois na hora.
 * Repolling curto de propósito: o cofre trava sozinho após um tempo (TTL no servidor), e sem isso a tela
 * ficaria mostrando o conteúdo já carregado mesmo depois de expirado, só corrigindo ao trocar de página.
 */
export const useVaultStatus = () => useQuery({ queryKey: ['vault'], queryFn: () => api.get<VaultStatus>('/vault/status'), refetchInterval: 20_000 });

export const usePrinciples = () => useQuery({ queryKey: ['principles'], queryFn: () => api.get<Principle[]>('/principles'), refetchInterval: 20_000 });
export const usePrincipleFolders = () => useQuery({ queryKey: ['principles', 'folders'], queryFn: () => api.get<PrincipleFolder[]>('/principles/folders') });
