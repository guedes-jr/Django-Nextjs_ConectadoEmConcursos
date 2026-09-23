export type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type Quiz = {
  slug: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
};

export const quizzes: Quiz[] = [
  {
    slug: "english",
    title: "Quiz de Inglês",
    description: "Gramática e interpretação de textos com vocabulário comum em provas de concurso.",
    questions: [
      {
        question: "Choose the correct option: \"She ___ to work every day.\"",
        options: ["go", "goes", "going", "gone"],
        answer: 1,
        explanation: "No presente simples, verbos da 3ª pessoa do singular (she/he/it) recebem -s/-es: she goes.",
      },
      {
        question: "Which word is a synonym of \"quickly\"?",
        options: ["slowly", "fast", "rarely", "lately"],
        answer: 1,
        explanation: "\"Quickly\" significa rapidamente; um sinônimo é \"fast\".",
      },
      {
        question: "Complete: \"If I ___ rich, I would travel the world.\"",
        options: ["am", "was", "were", "be"],
        answer: 2,
        explanation: "Em frases condicionais irreais, o passado do verbo to be é sempre \"were\" para todas as pessoas (subjuntivo).",
      },
      {
        question: "\"He has lived here ___ 2020.\" — o advérbio correto é:",
        options: ["for", "since", "from", "at"],
        answer: 1,
        explanation: "\"Since\" é usado com início do período (2020); \"for\" é usado com duração.",
      },
      {
        question: "Select the sentence in the passive voice:",
        options: [
          "The team won the game.",
          "The game was won by the team.",
          "The team is winning the game.",
          "The team has won the game.",
        ],
        answer: 1,
        explanation: "Na voz passiva, o objeto vira sujeito: \"was won by the team\" = foi vencido pelo time.",
      },
      {
        question: "The opposite of \"increase\" is:",
        options: ["grow", "rise", "decrease", "expand"],
        answer: 2,
        explanation: "\"Increase\" (aumentar) tem como antônimo \"decrease\" (diminuir).",
      },
      {
        question: "\"I enjoy ___ books on the weekend.\" — qual forma verbal completa a frase?",
        options: ["read", "to read", "reading", "reads"],
        answer: 2,
        explanation: "Após o verbo \"enjoy\" usa-se o gerúndio (-ing): enjoy reading.",
      },
      {
        question: "What does the expression \"by the way\" mean?",
        options: ["Além disso", "A propósito", "De modo algum", "De vez em quando"],
        answer: 1,
        explanation: "\"By the way\" é usado para introduzir um assunto novo: a propósito / aliás.",
      },
      {
        question: "Complete: \"There isn't ___ milk left in the fridge.\"",
        options: ["some", "many", "much", "a few"],
        answer: 2,
        explanation: "\"Milk\" é incontável; com negativas e incontáveis usa-se \"much\".",
      },
      {
        question: "\"He speaks English very ___ .\" O advérbio correto é:",
        options: ["good", "well", "fine", "nice"],
        answer: 1,
        explanation: "\"Well\" é o advérbio de \"good\". Depois de verbo de ação usa-se advérbio: speaks well.",
      },
    ],
  },
  {
    slug: "math",
    title: "Quiz de Matemática",
    description: "Aritmética, porcentagem, regra de três e raciocínio numérico para concursos.",
    questions: [
      {
        question: "Quanto é 15% de 240?",
        options: ["30", "36", "32", "40"],
        answer: 1,
        explanation: "15% de 240 = 0,15 × 240 = 36.",
      },
      {
        question: "Uma loja vende um produto por R$ 120,00 com desconto de 20%. Qual o preço final?",
        options: ["R$ 96,00", "R$ 100,00", "R$ 88,00", "R$ 92,00"],
        answer: 0,
        explanation: "20% de 120 = 24; 120 − 24 = 96.",
      },
      {
        question: "Se 3 máquinas produzem 90 peças em 2 horas, quantas peças 5 máquinas produzem em 2 horas?",
        options: ["120", "150", "180", "135"],
        answer: 1,
        explanation: "São grandezas diretamente proporcionais: 3 → 90, então 5 → 5/3 × 90 = 150.",
      },
      {
        question: "Qual o valor de x na equação 2x + 6 = 20?",
        options: ["5", "6", "7", "8"],
        answer: 2,
        explanation: "2x = 14 → x = 7.",
      },
      {
        question: "Um triângulo tem ângulos internos de 50° e 60°. Qual o terceiro ângulo?",
        options: ["60°", "70°", "80°", "90°"],
        answer: 1,
        explanation: "A soma dos ângulos internos de um triângulo é 180°: 180 − 110 = 70°.",
      },
      {
        question: "O resultado de (2³ + 3²) é:",
        options: ["13", "15", "17", "19"],
        answer: 2,
        explanation: "2³ = 8 e 3² = 9; 8 + 9 = 17.",
      },
      {
        question: "Um carro percorre 240 km com 20 litros de combustível. Qual o consumo médio (km/l)?",
        options: ["10", "12", "14", "8"],
        answer: 1,
        explanation: "240 ÷ 20 = 12 km por litro.",
      },
      {
        question: "Qual é 1/4 de 8/3?",
        options: ["2/3", "4/3", "1/2", "3/4"],
        answer: 0,
        explanation: "1/4 × 8/3 = 8/12 = 2/3.",
      },
      {
        question: "Ao dividir 1.350 por 15, o quociente é:",
        options: ["80", "85", "90", "95"],
        answer: 2,
        explanation: "1.350 ÷ 15 = 90.",
      },
      {
        question: "Uma progressão aritmética começa em 5 e tem razão 4. Qual o seu 6º termo?",
        options: ["21", "25", "29", "33"],
        answer: 1,
        explanation: "a6 = a1 + (6 − 1)·r = 5 + 5×4 = 25.",
      },
    ],
  },
  {
    slug: "logic",
    title: "Quiz de Raciocínio Lógico",
    description: "Lógica proposicional, sequências, conjuntos e problemas de raciocínio.",
    questions: [
      {
        question: "Complete a sequência: 2, 6, 12, 20, ___",
        options: ["28", "30", "32", "36"],
        answer: 1,
        explanation: "Os acréscimos são 4, 6, 8, 10... Logo: 20 + 10 = 30.",
      },
      {
        question: "Se todo gato é felino e alguns felinos são domésticos, podemos concluir que:",
        options: [
          "Todo felino é gato.",
          "Todo gato é doméstico.",
          "Alguns gatos podem ser domésticos.",
          "Nenhum gato é doméstico.",
        ],
        answer: 2,
        explanation: "Se alguns felinos são domésticos e todo gato é felino, então existe a possibilidade (não garantida) de alguns gatos serem domésticos.",
      },
      {
        question: "Qual afirmação é a negação de \"Todos os alunos estudaram\"?",
        options: [
          "Nenhum aluno estudou.",
          "Algum aluno não estudou.",
          "Todos os alunos estudaram.",
          "Alguns alunos estudaram.",
        ],
        answer: 1,
        explanation: "A negação de \"todo\" é \"pelo menos um não\": algum aluno não estudou.",
      },
      {
        question: "Em uma fila, Ana está à frente de Bruna e Claudia está atrás de Ana. Bruna está atrás de Claudia. Quem está no meio?",
        options: ["Ana", "Bruna", "Claudia", "Não é possível determinar"],
        answer: 2,
        explanation: "Ordem da frente para trás: Ana → Claudia → Bruna (Claudia está entre Ana e Bruna).",
      },
      {
        question: "Se A → B e B → C, então podemos concluir que:",
        options: ["A → C", "C → A", "A se e somente se C", "Nada se pode concluir"],
        answer: 0,
        explanation: "A implicação é transitiva: A → B e B → C implicam A → C.",
      },
      {
        question: "Complete a sequência: A, C, F, J, ___",
        options: ["K", "L", "M", "O"],
        answer: 3,
        explanation: "Os saltos são de +2, +3, +4, +5 letras: J + 5 = O.",
      },
      {
        question: "Em uma sala com 30 pessoas, 18 gostam de café e 15 gostam de chá. Sabendo que 5 gostam dos dois, quantas não gostam de nenhum dos dois?",
        options: ["2", "3", "4", "5"],
        answer: 0,
        explanation: "Total = café + chá − ambos + nenhum → 30 = 18 + 15 − 5 + x → x = 2.",
      },
      {
        question: "O quinto termo de uma sequência é 32 e cada termo é o dobro do anterior. Qual é o primeiro termo?",
        options: ["1", "2", "4", "8"],
        answer: 1,
        explanation: "Voltando: 5º=32, 4º=16, 3º=8, 2º=4, 1º=2.",
      },
      {
        question: "\"Se chover, o evento será adiado.\" O evento não foi adiado. Logo:",
        options: [
          "Choveu.",
          "Não choveu.",
          "O evento não existiu.",
          "Não é possível concluir.",
        ],
        answer: 1,
        explanation: "Pela contrapositiva da implicação (modus tollens), se a consequência não ocorreu, a condição também não ocorreu.",
      },
      {
        question: "Quantos quadrados há em um tabuleiro 2×2 de quadrados pequenos?",
        options: ["4", "5", "6", "9"],
        answer: 1,
        explanation: "São 4 quadrados pequenos (1×1) + 1 quadrado grande (2×2) = 5.",
      },
    ],
  },
];

export function getQuizBySlug(slug: string): Quiz | undefined {
  return quizzes.find((quiz) => quiz.slug === slug);
}