import { Router } from 'express';
import { pool } from '../config/db.js';
import { asyncRoute,AppError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
export const notificationsRoutes=Router();notificationsRoutes.use(requireAuth);
notificationsRoutes.get('/',asyncRoute(async(req,res)=>{const[rows]=await pool.execute(`SELECT id,titulo,mensagem,tipo,modulo,id_registro,lida,criado_em,lida_em FROM notificacoes WHERE id_usuario=? ORDER BY lida ASC,criado_em DESC LIMIT 200`,[req.session.user.id]);res.json({ok:true,data:rows});}));
notificationsRoutes.post('/:id/read',asyncRoute(async(req,res)=>{const[result]=await pool.execute(`UPDATE notificacoes SET lida=1,lida_em=COALESCE(lida_em,NOW()) WHERE id=? AND id_usuario=?`,[req.params.id,req.session.user.id]);if(!result.affectedRows)throw new AppError(404,'NOTIFICATION_NOT_FOUND','Notificação não encontrada.');res.json({ok:true});}));
notificationsRoutes.post('/read-all',asyncRoute(async(req,res)=>{await pool.execute(`UPDATE notificacoes SET lida=1,lida_em=COALESCE(lida_em,NOW()) WHERE id_usuario=? AND lida=0`,[req.session.user.id]);res.json({ok:true});}));
