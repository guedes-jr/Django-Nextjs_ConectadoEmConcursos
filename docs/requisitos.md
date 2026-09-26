## Estado dos requisitos

### Estrutura e autenticação
- [x] Backend Django/DRF e frontend Next.js integrados
- [x] Login por e-mail/senha e Google OAuth
- [x] Cadastro, logout, recuperação e alteração de senha via API
- [x] Perfis com dados pessoais e preferências de estudo

### Estudos
- [x] Dashboard e estatísticas reais
- [x] Questões: listagem, filtros, resposta, favoritos, anotações, comentários e erros
- [x] Provas: listagem, filtros e respectivas questões
- [x] Lousa: criar, editar, salvar, excluir e listar os dez últimos rascunhos
- [x] Importação idempotente de provas/questões em JSON ou CSV
- [x] Administração de conteúdo pelo Django Admin

### Chat e planos
- [x] Conversas persistentes e isoladas por usuário
- [x] Contexto real de provas, questões e desempenho
- [x] Assistência local e integração opcional com OpenAI
- [x] Limites diários, auditoria de provedor/modelo/tokens e permissões por plano
- [x] Catálogo e seleção de planos
- [ ] Checkout, webhooks, renovação e cancelamento financeiro reais
- [x] Ferramenta avançada de contexto de provas/questões restrita ao plano Avançado
- [ ] Simulados completos com IA e biblioteca de materiais (expansões futuras)

### PWA (ver `docs/plano-pwa.md`)
- [x] Manifesto, ícones (any/maskable) e metadados de instalação (`viewport`, `appleWebApp`)
- [x] Service worker com precache, cache de assets, página offline e atualização de versão
- [x] Prompt de instalação (Chromium/Edge/Android/desktop) e instruções manuais no iOS
- [x] Safe-area e ajustes de UX mobile
- [x] Headers de cache do service worker e do manifesto
- [ ] Regras de cache do `/sw.js` no nginx do servidor de produção
- [ ] Validação em devices reais (iOS Safari e Android Chrome)

### Produção
- [ ] Provedor SMTP/API transacional
- [ ] PostgreSQL, armazenamento de mídia e backups
- [ ] CI/CD, monitoramento de erros e testes E2E do frontend
