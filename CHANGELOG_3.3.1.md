# Versão 3.3.1 — Correção da validação da importação de Pessoal

- A importação não é mais interrompida por uma única linha incompleta ou repetida.
- Todas as linhas válidas são importadas normalmente.
- Linhas sem nome, MASP ou CPF com 11 dígitos são ignoradas e relacionadas apenas pelo número da linha.
- Repetições de MASP ou CPF dentro do arquivo são ignoradas após a primeira ocorrência.
- O diagnóstico agora informa `linhasAptas` e `linhasIgnoradas` sem expor CPF ou senha.
