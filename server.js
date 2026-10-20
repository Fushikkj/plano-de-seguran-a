
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();

app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'tarefas_treino',
  port: Number(process.env.DB_PORT) || 5432,
});

// Limita a quantidade de requisições
const limiteRequisicoes = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { erro: 'Muitas requisições. Tente novamente mais tarde.' }
});

app.use(limiteRequisicoes);

// Verifica o token de autenticação
function autenticar(req, res, next) {
  const autorizacao = req.headers.authorization;

  if (!autorizacao || !autorizacao.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Autenticação necessária' });
  }

  const token = autorizacao.split(' ')[1];

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

// GET /tarefas
app.get('/tarefas', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT * FROM tarefas ORDER BY id'
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar tarefas' });
  }
});

// GET /tarefas/buscar?termo=...
app.get('/tarefas/buscar', async (req, res) => {
  try {
    const { termo } = req.query;

    if (typeof termo !== 'string' || termo.trim().length === 0) {
      return res.status(400).json({ erro: 'Termo de busca inválido' });
    }

    if (termo.length > 255) {
      return res.status(400).json({ erro: 'Termo muito grande' });
    }

    const resultado = await pool.query(
      'SELECT * FROM tarefas WHERE titulo LIKE $1 ORDER BY id',
      [`%${termo}%`]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar tarefas' });
  }
});

// POST /tarefas
app.post('/tarefas', async (req, res) => {
  try {
    const { titulo } = req.body;

    if (typeof titulo !== 'string' || titulo.trim().length === 0) {
      return res.status(400).json({ erro: 'Título inválido ou vazio' });
    }

    if (titulo.trim().length > 255) {
      return res.status(400).json({ erro: 'Título muito grande' });
    }

    const resultado = await pool.query(
      'INSERT INTO tarefas (titulo, concluida) VALUES ($1, false) RETURNING *',
      [titulo.trim()]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao criar tarefa' });
  }
});

// PUT /tarefas/:id
app.put('/tarefas/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (!/^[1-9]\d*$/.test(id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }

    const resultado = await pool.query(
      'UPDATE tarefas SET concluida = true WHERE id = $1 RETURNING *',
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Tarefa não encontrada' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao atualizar tarefa' });
  }
});

// DELETE /tarefas/:id
app.delete('/tarefas/:id', autenticar, async (req, res) => {
  try {
    const id = req.params.id;

    if (!/^[1-9]\d*$/.test(id)) {
      return res.status(400).json({ erro: 'ID inválido' });
    }

    // O token precisa identificar o usuário responsável pela tarefa.
    const resultado = await pool.query(
      'DELETE FROM tarefas WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [id, req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        erro: 'Tarefa não encontrada ou sem permissão'
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao deletar tarefa' });
  }
});

app.listen(3000, () => {
  console.log('API de tarefas rodando em http://localhost:3000');
});
