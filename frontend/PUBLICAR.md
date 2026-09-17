# Publicar para o Lucas revisar

Como colocar o AppTrena Angular no ar para o Lucas avaliar, antes de o
backend existir.

---

## O problema que isso resolve

O botão **"Entrar sem servidor"** só aparece em desenvolvimento. Num
build de produção comum, sem API no ar, o Lucas não passaria da tela de
login — o site seria inútil.

Por isso existe um build específico de **revisão**: mantém esse botão
disponível e mostra um aviso explicando que as telas estão vazias por
falta de servidor, não por defeito.

---

## Passo 1 — Gerar os arquivos

Duplo clique em **`PUBLICAR-REVISAO.bat`**.

Ele compila e abre a pasta `revisao-para-enviar` com tudo pronto —
cerca de 650 KB.

---

## Passo 2 — Enviar para o servidor

No painel da Hostinger, abra o **Gerenciador de Arquivos** e vá até
`public_html`.

1. Crie uma pasta chamada **`novo`**.
2. Envie **todo o conteúdo** de `revisao-para-enviar` para dentro dela.
   Não envie a pasta em si — o conteúdo.
3. Confira que o arquivo **`.htaccess`** foi junto. Alguns
   gerenciadores escondem arquivos que começam com ponto; procure a
   opção "mostrar arquivos ocultos" se ele não aparecer.

O resultado deve ficar assim:

```
public_html/
├── html/          ← o app antigo, intocado
└── novo/          ← o Angular
    ├── .htaccess
    ├── index.html
    └── (vários arquivos .js e .css)
```

O app atual continua funcionando normalmente em
`trenadigital.com.br/html/`. As duas versões convivem.

---

## Passo 3 — Mandar o link

```
https://trenadigital.com.br/novo/
```

Diga ao Lucas para clicar em **"Entrar sem servidor"** na tela de login.

---

## O que ele vai poder avaliar

- Todas as telas, a navegação e o visual;
- os **cálculos**, que rodam no navegador: pode montar uma EAP, comparar
  propostas num mapa, lançar um pagamento e ver os números baterem;
- os atalhos de teclado nas tabelas (Tab, Enter, setas, Shift + `+`).

**O que não vai funcionar:** nada é salvo, e as listas aparecem vazias.
Ao recarregar a página, o que ele digitou some. Isso é esperado — não há
servidor para guardar.

---

## Sobre segurança

O modo de demonstração fica aberto para quem tiver o link. Como não há
banco de dados nem informação real por trás, o risco é baixo — mas vale
saber que a URL não é secreta.

Se preferir restringir, dá para proteger a pasta `/novo` com senha pelo
painel da Hostinger, em **Proteção de Diretório**.

---

## Quando o backend estiver de pé

Aí o build muda: use `npm run build` (sem `:revisao`), que usa
`environment.prod.ts` e **fecha o acesso de demonstração**. Esse é o
build definitivo.

Antes disso será preciso ajustar dois pontos, e eu faço isso quando
chegarmos lá:

- o `baseHref` em `angular.json`, se o app for para a raiz do domínio em
  vez de `/novo/`;
- o `apiUrl` em `environment.prod.ts`, apontando para onde a API estiver.
