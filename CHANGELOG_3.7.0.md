# Versão 3.7.0

## Importação inicial de Patrimônio

- consolida `Mapa Carga(1).xlsx`, `Dados completos(2).xlsx` e `RegistroDeEquipamento(1).xlsx` em um pacote incorporado ao projeto;
- prepara 233 cadastros de patrimônio;
- importa 60 pistolas Glock, séries `CGGM739` a `CGGM798`, com ficha técnica e controle individual;
- importa 25 rádios HT, identificações `15901` a `15925`, com controle individual;
- armas e rádios são marcados como cauteláveis;
- os demais itens são cadastrados por unidade ou quantidade e não são liberados para cautela automaticamente;
- evita duplicar as 60 armas e o estoque genérico de 25 rádios que também aparecem no Mapa de Carga;
- utiliza número de série, patrimônio e uma chave de origem incorporada às observações para impedir duplicidades em novas execuções;
- preserva dados já existentes e preenche apenas campos vazios, exceto a correção necessária para tornar armas e rádios cauteláveis;
- registra histórico dos patrimônios criados e cria automaticamente as categorias/subcategorias necessárias;
- mantém em relatório cinco itens sem quantidade válida na fonte: Rádio PTT, bateria de rádio, carregador de rádio, escada de sete degraus e carregador de arma reserva;
- responsáveis informados na planilha de armas são preservados nas observações para conferência e posterior cautela administrativa, sem criar cautelas retroativas automaticamente.

## Funções

```javascript
importarPatrimonioPlanilhasIniciais()
diagnosticarImportacaoPatrimonioPlanilhas()
listarPendenciasImportacaoPatrimonio()
```

Execute primeiro a importação e depois o diagnóstico. A função de importação também instala/repara o módulo Patrimônio antes de gravar os registros.
