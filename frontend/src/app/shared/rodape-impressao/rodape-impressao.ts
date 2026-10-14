import { Component } from '@angular/core';

/**
 * Rodapé compartilhado dos PDFs (14/10/2026, pedido do Lucas: até aqui
 * cada PDF tinha seu próprio texto de rodapé, divergentes entre si —
 * "Medição gerada automaticamente pelo ComTrena — trenadigital.com.br"
 * na Medição, "Gerado automaticamente pelo ComTrena — os valores
 * refletem os dados no momento da geração." nos outros — inclusive um
 * ainda citando o domínio antigo. Padronizado em "Geração do documento"
 * + a logomarca completa do ComTrena, mesmo arquivo usado no cabeçalho
 * (`CabecalhoImpressao`). Mesma ideia de extrair um componente único em
 * vez de duplicar o CSS/HTML em cada tela — ver `cabecalho-impressao.ts`.
 */
@Component({
  selector: 'app-rodape-impressao',
  templateUrl: './rodape-impressao.html',
  styleUrl: './rodape-impressao.scss',
})
export class RodapeImpressao {}
