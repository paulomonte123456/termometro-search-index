# Índice de pesquisa do Termómetro Oscar

Este repositório cria um índice central para a pesquisa do blog Cinema é Tudo
Isso. A indexação é feita no GitHub Actions, para que o navegador do visitante
não precise de abrir milhares de publicações.

O índice recolhe as publicações do arquivo principal do blog, incluindo título,
data, imagem, endereço e texto principal. A pesquisa no Weebly pode assim
calcular a relevância localmente, sem depender da indexação interna do Weebly.

## Ficheiros públicos

* `public/manifest.json`: versão, data e quantidade de publicações.
* `public/posts.json`: título, data, imagem, endereço e resumo dos posts.
* `public/palavras/*.json`: pequenos blocos do índice de palavras.
* `public/busca.js`: motor de pesquisa carregado pelo template do Weebly.

O navegador descarrega apenas os blocos das palavras pesquisadas. O estado
completo é guardado na publicação actual do GitHub Pages e não é acrescentado
ao histórico Git a cada quinze minutos.

## Primeira execução

Depois de configurar o GitHub Pages para usar GitHub Actions, executar o
workflow `Atualizar índice de pesquisa` com `Reconstruir todo o índice` activo.
Esta execução percorre o arquivo completo e abre cada publicação uma única vez
para recolher o texto pesquisável.

## Actualizações

As execuções normais consultam o feed recente e só abrem publicações novas.
Uma reconstrução completa semanal permite detectar publicações removidas ou
alteradas.
