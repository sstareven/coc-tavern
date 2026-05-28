import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CharacterSheet } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

const defaultSheet: CharacterSheet = {
  characteristics: { STR: 70, CON: 50, POW: 80, DEX: 65, APP: 45, SIZ: 55, INT: 75, EDU: 70 },
  halfFifth: { STR:{half:35,fifth:14}, CON:{half:25,fifth:10}, POW:{half:40,fifth:16}, DEX:{half:32,fifth:13}, APP:{half:22,fifth:9}, SIZ:{half:27,fifth:11}, INT:{half:37,fifth:15}, EDU:{half:35,fifth:14} },
  secondary: { hp:{current:10,max:10}, san:{current:72,max:80}, mp:{current:16,max:16}, luck:55, mov:8, db:'+1D4', build:1 },
  skills: { '图书馆使用':{base:20,current:60}, '驾驶':{base:20,current:50}, '心理学':{base:10,current:70} },
  identity: { name:'阿米蒂奇·沃伦', occupation:'地质学家', age:41, gender:'男', birthplace:'马萨诸塞州', residence:'阿卡姆·温迪尔街13号', id:'INV-1925-042' },
  greeting: '你的调查员阿米蒂奇·沃伦博士收到了一封来自阿卡姆镇以北农场的求助信。信中描述了一种怪异的现象：一颗陨石坠落在农场后，一切都开始变得不对劲——植物长得巨大却发出磷光，动物行为怪异，连家人也开始生病。作为一名地质学家，你的专业直觉告诉你这不是普通的陨石。但你内心深处隐隐感到，有些事情可能超越科学的范畴...',
  description: '阿米蒂奇·沃伦博士是密斯卡塔尼克大学的地质学教授，专攻陨石与矿物学。他在学术界以严谨著称，但近年来对科学无法解释的现象产生了浓厚兴趣——这种兴趣始于他在一次考古发掘中遇到了一件无法被任何已知分类法归类的矿物标本。沃伦博士中等身材，因常年野外考察而体格健壮。他戴着圆框眼镜，头发已经开始花白。随身携带一个老旧的皮制野外背包，里面装着地质锤、放大镜和一本翻旧的笔记本。',
  personality: '沃伦博士是一个理性至上的科学家，但并非固执己见之人。他相信科学最终能解释一切，但同时也承认当前的认知局限。他谨慎、观察力敏锐，在野外考察中培养出了出色的细节观察能力。他说话慢条斯理，习惯性地在做结论前停顿思索片刻。当面对超自然现象时，他的第一反应是寻找科学解释，但内心深处对未知的恐惧正在慢慢侵蚀他的理性。他对学生友善，但对学术界的政治斗争不屑一顾。',
  scenario: '1925年深秋，阿卡姆镇以北约15英里的加德纳农场发生了一系列怪事。一颗发出奇异光芒的陨石坠落在农场的草地上，此后一切开始变化：井水变得苦涩发臭，农作物长得异常硕大却发出不祥的磷光，农场的动物从马匹到老鼠都出现怪异的行为——有的疯狂逃窜，有的僵立不动。加德纳一家人的健康也在恶化——他们面色苍白、精神恍惚、皮肤上出现了无法解释的灰色斑点。沃伦博士被密斯卡塔尼克大学派往调查这颗陨石，但他很快发现，这不仅仅是地质学能够解释的问题。更令人不安的是，陨石似乎在一天天缩小——或者说，它正在渗入这片土地。',
  personaDescription: '{{user}}是阿米蒂奇·沃伦博士，密斯卡塔尼克大学地质学教授。你正在调查加德纳农场的陨石坠落事件。你的专业是矿物学和陨石研究，但这次你面对的是超越人类科学认知的事物。你携带了野外调查工具和一本笔记本。你的任务是：1）采集陨石样本进行分析，2）调查加德纳一家人的异常状况，3）确定是否存在对周边地区居民的健康威胁。你倾向于用科学方法解决问题，但要做好准备面对科学无法解释的恐怖。记住：宇宙比我们想象的更为黑暗、更为陌生。',
};

interface CharSheetStore {
  sheet: CharacterSheet;
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  setSheet: (sheet: CharacterSheet) => void;
}

export const useCharSheetStore = create<CharSheetStore>()(
  persist(
    (set) => ({
      sheet: defaultSheet,
      isOpen: false,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      close: () => set({ isOpen: false }),
      setSheet: (sheet: CharacterSheet) => set({ sheet }),
    }),
    {
      name: 'coc_character',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state as unknown as Record<string, unknown>) as Partial<CharSheetStore>,
    },
  ),
);
