# Redefinição direta de senha

Na lista `/admin/usuarios` e na ficha do usuário, a ação **Redefinir senha** abre um formulário com nova senha, confirmação e motivo. A troca é imediata e dispensa entrega de e-mail. O administrador combina a entrega da credencial com o usuário.

A API `POST /api/backoffice/users/<id>/password/` exige o papel Administrador. Apenas superusuários podem alterar senhas de contas administrativas, conforme a hierarquia já utilizada na gestão de staff. A política de senhas do Django considera os dados do usuário; senhas iguais à atual e confirmações divergentes são rejeitadas.

A gravação, revogação de sessões/tokens de acesso e auditoria ocorrem em uma transação. O evento `user.password_changed_by_admin` armazena ator, conta-alvo, motivo e número de sessões revogadas. Não inclui senha ou hash. JWTs são vinculados ao hash de senha por `CHECK_REVOKE_TOKEN`; tokens emitidos antes dessa configuração exigem novo login. A redefinição da própria conta encerra o acesso atual e leva à tela de login.

O envio de link por e-mail continua disponível separadamente na ficha. Nenhuma senha real foi alterada durante a implantação: os testes usaram contas e banco temporários.
