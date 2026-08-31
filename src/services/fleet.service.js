import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../config/db.js';
import { AppError } from '../lib/http.js';

function number(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new AppError(400, 'INVALID_NUMBER', `${field} inválido.`);
  return parsed;
}

async function acquireLock(db, name) {
  const [rows] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [name]);
  if (Number(rows[0]?.acquired) !== 1) throw new AppError(409, 'RESOURCE_BUSY', 'Outro usuário está alterando este registro. Tente novamente.');
}
async function releaseLock(db, name) { await db.execute('SELECT RELEASE_LOCK(?)', [name]).catch(() => {}); }

export async function startShift(user, permissions, payload) {
  return transaction(async (db) => {
    const lockName = `gcmp:fleet:start:${payload.idViatura}`;
    await acquireLock(db, lockName);
    try {
      const [vehicles] = await db.execute('SELECT * FROM viaturas WHERE id=? FOR UPDATE', [payload.idViatura]);
      const vehicle = vehicles[0];
      if (!vehicle) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Viatura não encontrada.');
      if (!['DISPONIVEL','RESERVADA'].includes(vehicle.status)) throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'A viatura não está disponível para iniciar turno.');
      const [conflicts] = await db.execute(`SELECT id FROM turnos_frota WHERE status='ABERTO' AND (id_viatura=? OR id_usuario_responsavel=?) LIMIT 1 FOR UPDATE`, [payload.idViatura,user.id]);
      if (conflicts[0]) throw new AppError(409, 'SHIFT_CONFLICT', 'A viatura ou o responsável já possui outro turno aberto.');
      const memberIds = [...new Set((Array.isArray(payload.integrantesIds)?payload.integrantesIds:[]).filter(Boolean))];
      if (memberIds.length) {
        const placeholders=memberIds.map(()=>'?').join(',');
        const [memberConflicts]=await db.execute(`SELECT it.id_pessoa FROM integrantes_turno it JOIN turnos_frota t ON t.id=it.id_turno WHERE t.status='ABERTO' AND it.id_pessoa IN (${placeholders}) LIMIT 1`,memberIds);
        if(memberConflicts[0]) throw new AppError(409,'PARTICIPANT_SHIFT_OPEN','Um dos integrantes já participa de outro turno aberto.');
      }
      const km=number(payload.kmInicial,'KM inicial'), currentKm=Number(vehicle.km_atual||0);
      if(km!==currentKm&&!String(payload.justificativaKm||'').trim()) throw new AppError(400,'KM_JUSTIFICATION_REQUIRED','Justifique a divergência da quilometragem inicial.');
      if(km!==currentKm&&!permissions.includes('frota.gerenciar')) throw new AppError(403,'KM_OVERRIDE_FORBIDDEN','A divergência de KM requer permissão de gestão da frota.');
      const [linked]=await db.execute('SELECT id_pessoa FROM usuarios WHERE id=?',[user.id]);
      const personId=linked[0]?.id_pessoa||null, id=randomUUID();
      await db.execute(`INSERT INTO turnos_frota (id,id_viatura,prefixo,placa,id_usuario_responsavel,id_pessoa_responsavel,nome_responsavel,masp_responsavel,setor,equipe,km_inicial,combustivel_inicial,condicoes_iniciais,avarias_iniciais,equipamentos_iniciais,justificativa_km,observacoes_inicio,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ABERTO')`,[id,vehicle.id,vehicle.prefixo,vehicle.placa,user.id,personId,user.nome,user.masp,payload.setor||user.setor||null,payload.equipe||null,km,payload.combustivelInicial||null,payload.condicoesIniciais||null,payload.avariasIniciais||null,payload.equipamentosIniciais||null,payload.justificativaKm||null,payload.observacoes||null]);
      if(memberIds.length){
        const placeholders=memberIds.map(()=>'?').join(',');
        const [people]=await db.execute(`SELECT id,nome_completo,masp,funcao FROM pessoas WHERE id IN (${placeholders})`,memberIds);
        for(const person of people) await db.execute(`INSERT INTO integrantes_turno (id,id_turno,id_pessoa,nome,masp,funcao) VALUES (?,?,?,?,?,?)`,[randomUUID(),id,person.id,person.nome_completo,person.masp,person.funcao]);
      }
      await db.execute(`UPDATE viaturas SET status='EM_SERVICO',atualizado_em=NOW(),atualizado_por=? WHERE id=?`,[user.id,vehicle.id]);
      return {id,vehicle:{id:vehicle.id,prefixo:vehicle.prefixo,placa:vehicle.placa}};
    } finally { await releaseLock(db,lockName); }
  });
}

export async function endShift(user, permissions, shiftId, payload) {
  return transaction(async(db)=>{
    const lockName=`gcmp:fleet:end:${shiftId}`; await acquireLock(db,lockName);
    try{
      const [shifts]=await db.execute('SELECT * FROM turnos_frota WHERE id=? FOR UPDATE',[shiftId]);
      const shift=shifts[0];
      if(!shift||shift.status!=='ABERTO') throw new AppError(404,'SHIFT_NOT_OPEN','Turno aberto não encontrado.');
      if(shift.id_usuario_responsavel!==user.id&&!permissions.includes('frota.gerenciar')) throw new AppError(403,'FORBIDDEN_SHIFT','Somente o responsável ou a gestão da frota pode encerrar este turno.');
      const [vehicles]=await db.execute('SELECT * FROM viaturas WHERE id=? FOR UPDATE',[shift.id_viatura]);
      const vehicle=vehicles[0]; if(!vehicle) throw new AppError(404,'VEHICLE_NOT_FOUND','Viatura do turno não encontrada.');
      const finalKm=number(payload.kmFinal,'KM final'), initialKm=Number(shift.km_inicial||0);
      if(finalKm<initialKm||finalKm<Number(vehicle.km_atual||0)) throw new AppError(400,'KM_REGRESSION','O KM final não pode ser menor que o KM inicial ou o último KM registrado.');
      const desiredStatus=String(payload.statusViatura||'DISPONIVEL').toUpperCase();
      if(!['DISPONIVEL','MANUTENCAO','INDISPONIVEL'].includes(desiredStatus)) throw new AppError(400,'INVALID_VEHICLE_STATUS','Status final da viatura inválido.');
      const needsMaintenance=Boolean(payload.necessitaManutencao), finalStatus=needsMaintenance?'MANUTENCAO':desiredStatus;
      await db.execute(`UPDATE turnos_frota SET fim_em=NOW(),km_final=?,km_percorrido=?,combustivel_final=?,ocorrencias=?,avarias_finais=?,falhas_mecanicas=?,multas=?,limpeza=?,equipamentos_ausentes=?,necessita_manutencao=?,observacoes_fim=?,status='ENCERRADO',atualizado_em=NOW() WHERE id=?`,[finalKm,finalKm-initialKm,payload.combustivelFinal||null,payload.ocorrencias||null,payload.avarias||null,payload.falhasMecanicas||null,payload.multas||null,payload.limpeza||null,payload.equipamentosAusentes||null,needsMaintenance?1:0,payload.observacoes||null,shiftId]);
      await db.execute(`UPDATE viaturas SET km_atual=?,km_atualizado_em=NOW(),status=?,atualizado_em=NOW(),atualizado_por=? WHERE id=?`,[finalKm,finalStatus,user.id,vehicle.id]);
      await db.execute(`INSERT INTO historico_km (id,id_viatura,prefixo,km_anterior,km_novo,origem,id_origem,id_usuario,justificativa) VALUES (?,?,?,?,?,'ENCERRAMENTO_TURNO',?,?,?)`,[randomUUID(),vehicle.id,vehicle.prefixo,Number(vehicle.km_atual||0),finalKm,shiftId,user.id,payload.justificativaKm||null]);
      const defectText=[payload.avarias,payload.falhasMecanicas].filter(Boolean).join(' | ');
      if(defectText) await db.execute(`INSERT INTO defeitos_frota (id,id_viatura,titulo,descricao,gravidade,status,registrado_por,registrado_por_nome,observacoes) VALUES (?,?,'Pendência registrada no encerramento de turno',?,?,'ABERTO',?,?,?)`,[randomUUID(),vehicle.id,defectText,payload.gravidade||'MEDIA',user.id,user.nome,payload.observacoes||null]);
      if(needsMaintenance) await db.execute(`INSERT INTO manutencoes_frota (id,id_viatura,tipo,descricao,km_entrada,status,responsavel_id,responsavel_nome,observacoes) VALUES (?,?,'AVALIACAO',?,?,'ABERTA',?,?,?)`,[randomUUID(),vehicle.id,defectText||'Viatura encaminhada para avaliação após encerramento de turno.',finalKm,user.id,user.nome,payload.observacoes||null]);
      return {id:shiftId,kmFinal:finalKm,statusViatura:finalStatus};
    } finally { await releaseLock(db,lockName); }
  });
}

export async function listOpenShifts(){const [rows]=await pool.query(`SELECT t.*,TIMESTAMPDIFF(MINUTE,t.inicio_em,NOW()) AS duracao_minutos,GROUP_CONCAT(i.nome ORDER BY i.nome SEPARATOR ', ') AS integrantes FROM turnos_frota t LEFT JOIN integrantes_turno i ON i.id_turno=t.id WHERE t.status='ABERTO' GROUP BY t.id ORDER BY t.inicio_em DESC`);return rows;}
export async function listShiftHistory(limit=200){const safeLimit=Math.max(1,Math.min(500,Number(limit)||200));const [rows]=await pool.query(`SELECT t.*,GROUP_CONCAT(i.nome ORDER BY i.nome SEPARATOR ', ') AS integrantes FROM turnos_frota t LEFT JOIN integrantes_turno i ON i.id_turno=t.id GROUP BY t.id ORDER BY t.inicio_em DESC LIMIT ${safeLimit}`);return rows;}
export async function listMaintenances(){const [rows]=await pool.query(`SELECT m.*,v.prefixo,v.placa FROM manutencoes_frota m JOIN viaturas v ON v.id=m.id_viatura ORDER BY FIELD(m.status,'ABERTA','EM_ANDAMENTO','AGUARDANDO_PECA','CONCLUIDA','CANCELADA'),m.data_entrada DESC`);return rows;}
export async function createMaintenance(user,payload){const id=randomUUID();await pool.execute(`INSERT INTO manutencoes_frota (id,id_viatura,tipo,descricao,oficina,data_prevista_saida,km_entrada,custo,status,responsavel_id,responsavel_nome,observacoes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[id,payload.idViatura,payload.tipo||'CORRETIVA',payload.descricao,payload.oficina||null,payload.dataPrevistaSaida||null,payload.kmEntrada??null,payload.custo??null,payload.status||'ABERTA',user.id,user.nome,payload.observacoes||null]);await pool.execute(`UPDATE viaturas SET status='MANUTENCAO',atualizado_em=NOW(),atualizado_por=? WHERE id=?`,[user.id,payload.idViatura]);return{id};}
export async function finishMaintenance(user,id,payload){return transaction(async(db)=>{const[rows]=await db.execute('SELECT * FROM manutencoes_frota WHERE id=? FOR UPDATE',[id]);const maintenance=rows[0];if(!maintenance)throw new AppError(404,'MAINTENANCE_NOT_FOUND','Manutenção não encontrada.');const km=payload.kmSaida==null||payload.kmSaida===''?null:number(payload.kmSaida,'KM de saída');await db.execute(`UPDATE manutencoes_frota SET status='CONCLUIDA',data_saida=NOW(),km_saida=?,custo=COALESCE(?,custo),observacoes=COALESCE(?,observacoes),atualizado_em=NOW() WHERE id=?`,[km,payload.custo??null,payload.observacoes||null,id]);if(km!=null){const[vehicles]=await db.execute('SELECT prefixo,km_atual FROM viaturas WHERE id=? FOR UPDATE',[maintenance.id_viatura]);const vehicle=vehicles[0];if(vehicle&&km>=Number(vehicle.km_atual||0)){await db.execute('UPDATE viaturas SET km_atual=?,km_atualizado_em=NOW() WHERE id=?',[km,maintenance.id_viatura]);await db.execute(`INSERT INTO historico_km (id,id_viatura,prefixo,km_anterior,km_novo,origem,id_origem,id_usuario) VALUES (?,?,?,?,?,'MANUTENCAO',?,?)`,[randomUUID(),maintenance.id_viatura,vehicle.prefixo,Number(vehicle.km_atual||0),km,id,user.id]);}}await db.execute(`UPDATE viaturas SET status='DISPONIVEL',atualizado_em=NOW(),atualizado_por=? WHERE id=?`,[user.id,maintenance.id_viatura]);return{id};});}
export async function listTires(vehicleId=''){const params=[];let where='';if(vehicleId){where='WHERE p.id_viatura=?';params.push(vehicleId);}const[rows]=await pool.execute(`SELECT p.*,v.prefixo,v.placa FROM pneus_frota p JOIN viaturas v ON v.id=p.id_viatura ${where} ORDER BY v.prefixo,p.status,p.posicao`,params);return rows;}
export async function installTire(payload){const id=randomUUID();await pool.execute(`INSERT INTO pneus_frota (id,id_viatura,posicao,marca,modelo,numero_serie,dot,instalado_em,km_instalacao,status,observacoes) VALUES (?,?,?,?,?,?,?,NOW(),?,'INSTALADO',?)`,[id,payload.idViatura,payload.posicao,payload.marca||null,payload.modelo||null,payload.numeroSerie||null,payload.dot||null,payload.kmInstalacao??null,payload.observacoes||null]);return{id};}
export async function removeTire(id,payload){const[result]=await pool.execute(`UPDATE pneus_frota SET status='REMOVIDO',removido_em=NOW(),km_remocao=?,motivo_remocao=?,observacoes=COALESCE(?,observacoes),atualizado_em=NOW() WHERE id=? AND status='INSTALADO'`,[payload.kmRemocao??null,payload.motivoRemocao||null,payload.observacoes||null,id]);if(!result.affectedRows)throw new AppError(404,'TIRE_NOT_FOUND','Pneu instalado não encontrado.');return{id};}
