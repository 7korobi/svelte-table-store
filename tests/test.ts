import { expect, test } from '@playwright/test';
import { relation, table } from '../src/lib/index.js';

const Family = table((o)=> o.name, [
	{ name: '波平'},
	{ name: '海平'},
	{ name: 'フネ'},
	{ name: 'ワカメ', father: '波平', mother: 'フネ'},
	{ name: 'カツオ', father: '波平', mother: 'フネ'},
	{ name: 'サザエ', father: '波平', mother: 'フネ'},
	{ name: 'マスオ'},
	{ name: 'タラオ', father: 'マスオ', mother: 'サザエ'},
	{ name: 'ヒトデ', father: 'マスオ', mother: 'サザエ'},
]);

const ChildrenBase = relation(Family).to(Family, (o)=>[o.father, o.mother])
const DescendantLeaf = ChildrenBase.repeat('leaf').order((o)=>[o.father])
const Descendants = ChildrenBase.repeat('all').order((o)=>[o.father])
const Children = ChildrenBase.order((o)=>[o.father])

test('family', async ({ page }) => {
	const 波平children = Children.get()(Family.get().find('波平'))
	const 波平grandchildren = Children.get()(...波平children)
	const 波平grandgrandchildren = Children.get()(...波平grandchildren)
	const 波平descendantLeaf = DescendantLeaf.get()(Family.get().find('波平'))
	const 波平descendants = Descendants.get()(Family.get().find('波平'))
	
	expect(波平children.map((o)=>o.name)).toEqual(['ワカメ','カツオ','サザエ'])
	expect(波平grandchildren.map((o)=>o.name)).toEqual(['タラオ','ヒトデ'])
	expect(波平grandgrandchildren.map((o)=>o.name)).toEqual([])
	expect(波平descendantLeaf.map((o)=>o.name)).toEqual(['ワカメ','カツオ','タラオ','ヒトデ'])
	expect(波平descendants.map((o)=>o.name)).toEqual(['ワカメ','カツオ','サザエ','タラオ','ヒトデ'])
});

