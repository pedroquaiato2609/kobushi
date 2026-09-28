import type { BoardRepository } from '../../application/ports';
import type { Board, BoardFull, Card, Column, NewCard } from '../../domain/entities';
import { withTx, type Db } from '../db/pool';
import { mapRow, mapRows, updateRow } from '../db/util';

export class PgBoardRepository implements BoardRepository {
  constructor(private db: Db) {}

  async overdueCards(today: string) {
    const { rows } = await this.db.query(
      `SELECT c.id, c.title, c.due_date FROM cards c JOIN board_columns col ON col.id = c.column_id
        WHERE c.due_date < $1 AND col.position < (SELECT max(position) FROM board_columns WHERE board_id = col.board_id)
        ORDER BY c.due_date LIMIT 10`, [today]);
    return rows.map((r) => ({ id: r.id as string, title: r.title as string, dueDate: r.due_date as string }));
  }

  // Quadros -------------------------------------------------------------
  async listBoards() {
    const { rows } = await this.db.query('SELECT * FROM boards ORDER BY created_at');
    return mapRows<Board>(rows);
  }

  async getBoard(id: string): Promise<BoardFull | null> {
    const b = await this.db.query('SELECT * FROM boards WHERE id = $1', [id]);
    if (!b.rows[0]) return null;
    const cols = await this.db.query('SELECT * FROM board_columns WHERE board_id = $1 ORDER BY position, created_at', [id]);
    const cards = await this.db.query(
      `SELECT c.* FROM cards c JOIN board_columns bc ON bc.id = c.column_id
        WHERE bc.board_id = $1 ORDER BY c.position, c.created_at`,
      [id],
    );
    const allCards = mapRows<Card>(cards.rows);
    return {
      ...(mapRow<Board>(b.rows[0]) as Board),
      columns: mapRows<Column>(cols.rows).map((col) => ({ ...col, cards: allCards.filter((c) => c.columnId === col.id) })),
    };
  }

  async createBoard(name: string) {
    const { rows } = await this.db.query('INSERT INTO boards (name) VALUES ($1) RETURNING *', [name]);
    return mapRow<Board>(rows[0]) as Board;
  }

  async renameBoard(id: string, name: string) {
    const { rows } = await this.db.query('UPDATE boards SET name = $2 WHERE id = $1 RETURNING *', [id, name]);
    return mapRow<Board>(rows[0]);
  }

  async deleteBoard(id: string) {
    const res = await this.db.query('DELETE FROM boards WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // Colunas -------------------------------------------------------------
  async getColumn(id: string) {
    const { rows } = await this.db.query('SELECT * FROM board_columns WHERE id = $1', [id]);
    return mapRow<Column>(rows[0]);
  }

  async createColumn(boardId: string, name: string) {
    const { rows } = await this.db.query(
      `INSERT INTO board_columns (board_id, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position) + 1, 0) FROM board_columns WHERE board_id = $1)) RETURNING *`,
      [boardId, name],
    );
    return mapRow<Column>(rows[0]) as Column;
  }

  async renameColumn(id: string, name: string) {
    const { rows } = await this.db.query('UPDATE board_columns SET name = $2 WHERE id = $1 RETURNING *', [id, name]);
    return mapRow<Column>(rows[0]);
  }

  async deleteColumn(id: string) {
    const res = await this.db.query('DELETE FROM board_columns WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // Cards ---------------------------------------------------------------
  async getCard(id: string) {
    const { rows } = await this.db.query('SELECT * FROM cards WHERE id = $1', [id]);
    return mapRow<Card>(rows[0]);
  }

  async createCard(columnId: string, d: NewCard) {
    const { rows } = await this.db.query(
      `INSERT INTO cards (column_id, title, description, due_date, activity_id, position)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(position) + 1, 0) FROM cards WHERE column_id = $1)) RETURNING *`,
      [columnId, d.title, d.description, d.dueDate, d.activityId],
    );
    return mapRow<Card>(rows[0]) as Card;
  }

  async updateCard(id: string, patch: Partial<NewCard>) {
    const row = await updateRow(this.db, 'cards', 'id', id, patch, ['title', 'description', 'dueDate', 'activityId']);
    return mapRow<Card>(row);
  }

  /** Move para a coluna/posição e renumera a coluna de destino (transação). */
  async moveCard(id: string, columnId: string, position?: number) {
    return withTx(async (tx) => {
      const found = await tx.query('SELECT id FROM cards WHERE id = $1 FOR UPDATE', [id]);
      if (!found.rows[0]) return null;

      const siblings = (
        await tx.query('SELECT id FROM cards WHERE column_id = $1 AND id <> $2 ORDER BY position, created_at', [columnId, id])
      ).rows.map((r) => r.id as string);
      const index = position === undefined ? siblings.length : Math.min(position, siblings.length);
      siblings.splice(index, 0, id);

      await tx.query('UPDATE cards SET column_id = $2, updated_at = now() WHERE id = $1', [id, columnId]);
      for (let i = 0; i < siblings.length; i++) {
        await tx.query('UPDATE cards SET position = $2 WHERE id = $1', [siblings[i], i]);
      }
      const { rows } = await tx.query('SELECT * FROM cards WHERE id = $1', [id]);
      return mapRow<Card>(rows[0]);
    });
  }

  async deleteCard(id: string) {
    const res = await this.db.query('DELETE FROM cards WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
