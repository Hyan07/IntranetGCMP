-- Normaliza registros existentes da v4 para as novas colunas quantitativas da v5.
UPDATE patrimonios
   SET quantidade_total = CASE WHEN quantidade_total < 1 THEN 1 ELSE quantidade_total END,
       quantidade_disponivel = CASE
         WHEN status = 'CAUTELADO' THEN 0
         WHEN status = 'PARCIALMENTE_CAUTELADO' THEN GREATEST(0, quantidade_disponivel)
         ELSE GREATEST(1, quantidade_disponivel)
       END,
       quantidade_cautelada = CASE
         WHEN status = 'CAUTELADO' THEN GREATEST(1, quantidade_cautelada)
         WHEN status = 'PARCIALMENTE_CAUTELADO' THEN GREATEST(1, quantidade_cautelada)
         ELSE GREATEST(0, quantidade_cautelada)
       END;

UPDATE itens_cautela i
JOIN cautelas c ON c.id = i.id_cautela
   SET i.status = CASE
     WHEN c.status IN ('DEVOLVIDA','CANCELADA') THEN c.status
     ELSE i.status
   END;
