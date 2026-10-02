# Minhas Finanças

Aplicativo de controle financeiro pessoal, em português do Brasil, feito para o celular.
É um **PWA**: abre no navegador e pode ser instalado na tela inicial (iPhone e Android), funciona offline e **guarda os dados apenas no próprio aparelho**.

## O que tem

| Área | Recursos |
|---|---|
| **Início** | Saldo atual, entradas/saídas, parcelas do mês, falta pagar, já pago, vencimentos em 7 dias, cartões, financiamentos, metas, previsão do fim do mês e gráficos (entradas x saídas, categorias, formas de pagamento, evolução do saldo, parcelas nos próximos meses). Períodos: hoje, semana, mês, próximo mês, personalizado. |
| **Entradas / Saídas** | Valor, data, descrição, origem, categoria/subcategoria, forma de pagamento, conta, cartão, à vista ou parcelado, recorrente, observação. Categorias, origens e formas personalizáveis. |
| **Lançamento rápido** | Botão “+ Lançamento” com campo de texto: `Mercado Livre — R$ 1.200 — 10x cartão`, `Financiamento Duster — R$ 80.000 — 48x — primeira parcela 10/10/2026`, `Salário 5.000 todo dia 5`. O app preenche o que entendeu e pede só o que falta. |
| **Cartões** | Limite, disponível, fechamento, vencimento, fatura atual, próximas faturas, pagar fatura. Parcelas distribuídas automaticamente nas faturas. |
| **Compras** | Plataforma/loja, produto, parcelas, cartão, status e entrega; total por plataforma, parceladas, não pagas, histórico. |
| **Financiamentos** | Price ou SAC (ou “não sei”), taxa mensal/anual (uma calcula a outra), taxa estimada pela parcela quando não informada, saldo devedor informado pelo banco, cronograma completo, evolução por ano, totais pagos/restantes, juros, % pago, quitação. |
| **Simulador** | Antecipar últimas parcelas com desconto de juros, pagar R$ X a mais por mês, pagamento extraordinário (reduzir prazo ou parcela). Avisa quando é apenas simulação e permite usar os dados do banco. |
| **Dívidas e compromissos** | Separação automática: vencidas, hoje, 7 dias, 30 dias, futuras, pagas. |
| **Contas recorrentes** | Valor fixo ou variável, dia, frequência, início e fim. Lança os próximos 12 meses automaticamente. |
| **Metas e reserva** | Progresso, aportes/retiradas, “guardando R$ X por mês, chego em…”, reserva em meses de despesas. |
| **Próximos meses** | Previsão de 12 meses: entradas, despesas, parcelas, dívidas, financiamentos e saldo projetado. |
| **Minha situação** | Médias, comprometimento da renda, meses mais pesados, quanto dá para economizar, tempo até as metas. |
| **Alertas** | Contas/parcelas/faturas vencendo, atrasos, limite do cartão, metas, saldo projetado negativo, fim de financiamento. |
| **Pesquisa e relatórios** | Filtros por data, categoria, forma, conta, cartão, tipo, plataforma, situação. Relatórios mensais e anuais; exportação para Excel (CSV) e PDF. |
| **Segurança** | PIN, Face ID/biometria (WebAuthn), backup criptografado (AES-256) enviado por e-mail/Drive/iCloud e restauração. |

## Privacidade e backup

Nada é enviado para servidores. Para recuperar os dados ao trocar de celular, use **Mais → Ajustes e backup → Enviar backup**: o arquivo (opcionalmente protegido por senha) vai para o seu e-mail ou nuvem pelo menu de compartilhamento do celular. No celular novo, use **Restaurar de um backup**.

## Instalar no celular

1. Publique (veja abaixo) e abra o endereço no celular.
2. iPhone (Safari): Compartilhar → **Adicionar à Tela de Início**. Android (Chrome): menu → **Instalar app**.

### Publicação no GitHub Pages

O workflow `.github/workflows/deploy.yml` roda os testes e publica a cada push na `main`.
Ative uma vez em **Settings → Pages → Source: GitHub Actions**.

## Desenvolvimento

```bash
npm install
npm run dev     # servidor local
npm test        # testes dos cálculos financeiros
npm run build   # gera dist/
```

Código principal:

- `src/lib/finance.ts` — Price, SAC, taxas, cronograma, antecipação e simulações
- `src/lib/generate.ts` — parcelas, faturas de cartão, recorrências
- `src/lib/projections.ts` — saldos, previsões, alertas e análises
- `src/lib/parser.ts` — lançamento rápido em linguagem natural
- `src/lib/__tests__` — testes dos cálculos
