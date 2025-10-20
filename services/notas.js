import { api } from '../api';

export const getNotasLead = async (leadId) => {
  const res = await api.get(`/notas/lead/${leadId}`);
  return res.data;
};

export const createNota = async (data) => {
  const res = await api.post('/notas', data);
  return res.data;
};

export const deleteNota = async (id) => {
  const res = await api.delete(`/notas/${id}`);
  return res.data;
};