import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return <LegalPage title="Política de Privacidade" updatedAt="26 de setembro de 2026" intro="Esta política explica como o Conectado em Concursos trata dados pessoais quando você usa nossa plataforma." sections={[
    { title: "1. Dados que tratamos", content: <p>Podemos tratar dados de cadastro, como nome de usuário e e-mail, dados de perfil que você decidir informar, seu uso da plataforma, respostas, planos de estudo e informações necessárias para suporte e segurança.</p> },
    { title: "2. Finalidades", content: <p>Usamos esses dados para criar e manter sua conta, fornecer os recursos de estudo, personalizar sua experiência, atender solicitações, prevenir abusos e cumprir obrigações legais.</p> },
    { title: "3. Compartilhamento", content: <p>Não vendemos dados pessoais. Podemos compartilhá-los com fornecedores necessários para operar a plataforma, como hospedagem, autenticação e processamento de pagamentos, sempre conforme aplicável e com acesso limitado ao necessário.</p> },
    { title: "4. Segurança e retenção", content: <p>Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados. Mantemos as informações pelo tempo necessário para as finalidades desta política, para cumprir obrigações legais ou resolver disputas.</p> },
    { title: "5. Seus direitos", content: <p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, eliminação ou informações sobre compartilhamento, nos limites da legislação aplicável, incluindo a LGPD.</p> },
    { title: "6. Contato e alterações", content: <p>Para dúvidas ou solicitações sobre privacidade, entre em contato por conectadoemconcursos@gmail.com. Poderemos atualizar esta política; a versão vigente ficará publicada nesta página.</p> },
  ]} />;
}
