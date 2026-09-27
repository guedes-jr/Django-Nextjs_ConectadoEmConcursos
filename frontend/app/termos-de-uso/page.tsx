import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermsPage() {
  return <LegalPage title="Termos de Uso" updatedAt="26 de setembro de 2026" intro="Ao criar uma conta ou usar o Conectado em Concursos, você concorda com estes termos." sections={[
    { title: "1. Uso da plataforma", content: <p>A plataforma oferece recursos de apoio à preparação para concursos. Você é responsável pelas informações fornecidas, pelo uso da sua conta e por manter suas credenciais em sigilo.</p> },
    { title: "2. Conta e elegibilidade", content: <p>Forneça dados verdadeiros e atualizados. Não compartilhe a sua conta nem use a conta de outra pessoa. Podemos suspender ou encerrar contas que violem estes termos ou a legislação aplicável.</p> },
    { title: "3. Conteúdo e propriedade intelectual", content: <p>Textos, interfaces, materiais e funcionalidades da plataforma são protegidos por direitos aplicáveis. Você não pode copiar, redistribuir, comercializar ou explorar o conteúdo sem autorização, exceto quando a lei permitir.</p> },
    { title: "4. Planos e pagamentos", content: <p>Recursos pagos, preços, períodos e regras de cobrança são apresentados antes da contratação. Eventuais cancelamentos e reembolsos seguem as condições informadas no momento da compra e a legislação aplicável.</p> },
    { title: "5. Condutas proibidas", content: <p>Não é permitido usar a plataforma para fraude, violação de direitos de terceiros, tentativa de acesso não autorizado, envio de conteúdo ilícito ou qualquer ação que prejudique o serviço ou outros usuários.</p> },
    { title: "6. Alterações e contato", content: <p>Podemos atualizar estes termos para refletir mudanças no serviço ou na legislação. Quando aplicável, comunicaremos alterações relevantes. Dúvidas podem ser enviadas para conectadoemconcursos@gmail.com.</p> },
  ]} />;
}
