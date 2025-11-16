const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { Types } = mongoose;
const ObjectId = Types.ObjectId;
const config = require('../utils/config');

// Dynamically resolve collections from active mongoose connection
const Models = new Proxy({}, {
	get: (_, collectionName) => mongoose.connection.collection(String(collectionName))
});

module.exports.createRoleHistory = async (role, type, user) => {
	if (!role || !role._id) return;
	const base = {
		userId: user && user._id,
		roleId: role._id,
		createdAt: new Date()
	};
	if (type === 'CREATE') {
		await Models.roleHistory.insertOne({
			...base,
			field: 'ROLE CREATED',
			action: 'Role created'
		});
	} else if (type === 'DELETE') {
		await Models.roleHistory.insertOne({
			...base,
			field: 'ROLE DELETED',
			action: `Role ${role.rolename} is deleted`
		});
	} else {
		await Models.roleHistory.insertOne({
			...base,
			field: 'name',
			action: `Role name changed to ${role.rolename}`
		});
	}
};

module.exports.createPermissionHistory = async (permissions, type, user) => {
	if (type === 'CREATE') {
		const histories = [];
		for (const permission of permissions) {
			if (!permission || permission.action === 'disallow') continue;
			histories.push({
				userId: user && user._id,
				roleId: permission.roleId,
				permissionId: permission._id,
				field: 'PERMISSION CREATED',
				action: `Permission enabled to ${permission.action} ${permission.type}`,
				createdAt: new Date()
			});
		}
		if (histories.length) await Models.roleHistory.insertMany(histories);
	} else {
		const histories = [];
		const permissionObjs = await Models.aclPermissions.find({ _id: { $in: permissions } }).toArray();
		for (const permission of permissionObjs) {
			if (!permission || permission.action === 'disallow') continue;
			histories.push({
				userId: user && user._id,
				roleId: permission.roleId,
				permissionId: permission._id,
				field: 'PERMISSION DELETED',
				action: `Permission disabled to ${permission.action} ${permission.type}`,
				createdAt: new Date()
			});
		}
		if (histories.length) await Models.roleHistory.insertMany(histories);
	}
};

module.exports.createUserRoleHistory = async (prvRoleNames, userId, user) => {
	let roles = [];
	const userRoles = await Models.userRoles.find({ userId }).toArray();
	const roleIds = [];
	userRoles.forEach((userRole) => {
		roleIds.push(ObjectId(userRole.roleId));
	});
	try {
		if (roleIds.length) roles = await Models.roles.find({ _id: { $in: roleIds } }).toArray();
	} catch (e) {
		logger.error(e);
	}
	const roleNames = roles.map((r) => r.rolename);
	const history = {
		targetUserId: userId,
		userId: user && user._id,
		field: 'role',
		action: `Roles changed from (${prvRoleNames}) to (${roleNames})`,
		createdAt: new Date()
	};
	await Models.userHistory.insertOne(history);
};

module.exports.createUserHistory = async (type, userId, user, beforeObj, updatedObj) => {
	if (type === 'CREATE') {
		await Models.userHistory.insertOne({
			targetUserId: userId,
			userId: user && user._id,
			field: 'NEW USER',
			action: `User created by ${user.name}`,
			createdAt: new Date()
		});
	} else {
		const beforeKey = Object.keys(updatedObj)[0];
		if (!Object.prototype.hasOwnProperty.call(updatedObj, 'password')) {
			await Models.userHistory.insertOne({
				userId: user && user._id,
				targetUserId: userId,
				valueBefore: beforeObj[beforeKey],
				valueAfter: Object.values(updatedObj)[0],
				field: beforeKey,
				action: `Edited ${beforeKey[0].toUpperCase()}${beforeKey.slice(1)}${beforeObj[beforeKey] ? ' from "' + beforeObj[beforeKey] + '"' : ''} to "${Object.values(updatedObj)[0]}"`,
				createdAt: new Date()
			});
		} else if (Object.prototype.hasOwnProperty.call(updatedObj, 'status')) {
			await Models.userHistory.insertOne({
				targetUserId: userId,
				userId: user && user._id,
				field: 'USER DELETE',
				action: `User is DELETED`,
				createdAt: new Date()
			});
		}
	}
};

module.exports.createPlazaHistory = (user, plazaId, action) => {
	return Models.plazaHistory.insertOne({
		userId: user._id,
		plazaId: ObjectId(plazaId),
		field: 'Plaza Update',
		action,
		createdAt: new Date()
	});
};

module.exports.getplazaEdited = (beforeData, plazaData) => {
	const result = {};
	const keys = [...new Set([...Object.keys(plazaData), ...Object.keys(beforeData)])];
	keys.forEach(key => {
		if (beforeData[key] !== plazaData[key] && !Object.is(beforeData[key], plazaData[key]) && key !== 'lastLoaded' && key !== 'lastValidatedAt') {
			result[key] = plazaData[key];
		}
		if (typeof beforeData[key] === 'object' && typeof plazaData[key] === 'object' && key !== 'lastLoaded' && key !== 'lastValidatedAt') {
			const value = module.exports.getplazaEdited(beforeData[key], plazaData[key]);
			if (value !== undefined) {
				result[key] = value;
			}
		}
		if (key === 'lastLoaded' && plazaData.lastLoaded.getTime() !== new Date(beforeData.lastLoaded).getTime()) {
			result[key] = plazaData[key];
		}
		if (key === 'lastValidatedAt' && plazaData.lastValidatedAt.getTime() !== new Date(beforeData.lastValidatedAt).getTime()) {
			result[key] = plazaData[key];
		}
	});
	return result;
};

module.exports.createEtcReconciliationHistory = async (etcreconciliation, type, user, bodyObj) => {
	if (type === 'CREATE') {
		for (const key in bodyObj.updateObj) {
			// eslint-disable-next-line no-prototype-builtins
			if (!bodyObj.updateObj.hasOwnProperty(key)) continue;
			await Models.etcReconciliationHistory.insertOne({
				userId: user && user._id,
				etcreconciliationId: etcreconciliation._id,
				date: new Date(bodyObj.date),
				field: key,
				action: `Added value for "${key} = ${bodyObj.updateObj[key]}", for Date ${new Date(bodyObj.date).toDateString()}`,
				createdAt: new Date()
			});
		}
	} else {
		for (const key in bodyObj) {
			// eslint-disable-next-line no-prototype-builtins
			if (!bodyObj.hasOwnProperty(key)) continue;
			await Models.etcReconciliationHistory.insertOne({
				userId: user && user._id,
				etcreconciliationId: etcreconciliation._id,
				field: key,
				date: etcreconciliation.date,
				action: etcreconciliation[key]
					? `"${key}" value changed from "${etcreconciliation[key]}" to "${bodyObj[key]}" for Date ${etcreconciliation.date.toDateString()}`
					: `"${key}" value changed to "${bodyObj[key]}" for Date ${etcreconciliation.date.toDateString()}`,
				createdAt: new Date()
			});
		}
	}
};

module.exports.createERPTrafficHistory = async (type, user, date, plazaId) => {
	let action;
	if (type === 'CREATE') {
		action = 'ERP Traffic created';
	} else if (type === 'UPDATE') {
		action = 'ERP Traffic Updated';
	} else if (type === 'FREEZE') {
		action = 'ERP Traffic Freezed';
	}
	if (!action) return;
	await Models.erpTrafficHistory.insertOne({
		userId: user && user._id,
		plazaId: plazaId,
		date: new Date(date),
		action,
		createdAt: new Date()
	});
};

module.exports.createERPTrafficRatesHistory = async (fromDate, toDate, prevArray, updatedArray, user, plazaId, entryPlazaId, entryPlazaName, plazaName, dheplPlazaObj) => {
	const resArray = [];
	prevArray.forEach((e) => {
		let obj;
		if (Object.keys(dheplPlazaObj || {}).length) {
			if (e.paymentMethod === 'cash') {
				obj = updatedArray.find(o => o.vehicleType === e.vehicleType && o.journeyType === e.journeyType && o.paymentMethod === e.paymentMethod && !o.exitPlazaId);
			} else {
				obj = updatedArray.find(o => o.vehicleType === e.vehicleType && o.journeyType === e.journeyType && o.paymentMethod === e.paymentMethod && String(o.exitPlazaId) === String(e.exitPlazaId));
			}
		} else {
			obj = updatedArray.find(o => o.vehicleType === e.vehicleType && o.journeyType === e.journeyType);
		}
		if (!obj) return;
		if (e.rate !== obj.rate) {
			const resObj = {
				vehicleType: obj.vehicleType,
				journeyType: obj.journeyType,
				beforeRate: e.rate,
				afterRate: obj.rate
			};
			if (Object.keys(dheplPlazaObj || {}).length) {
				resObj.paymentMethod = obj.paymentMethod;
				if (obj.exitPlazaId) resObj.exitPlazaId = ObjectId(obj.exitPlazaId);
			}
			resArray.push(resObj);
		}
		if (e.penaltyRate !== obj.penaltyRate) {
			const resObj = {
				vehicleType: obj.vehicleType,
				journeyType: obj.journeyType,
				beforePenaltyRate: e.penaltyRate,
				afterPenaltyRate: obj.penaltyRate
			};
			if (Object.keys(dheplPlazaObj || {}).length) {
				resObj.paymentMethod = obj.paymentMethod;
				if (obj.exitPlazaId) resObj.exitPlazaId = ObjectId(obj.exitPlazaId);
			}
			resArray.push(resObj);
		}
	});
	const histories = [];
	for (const obj of resArray) {
		const historyObj = {
			userId: user && user._id,
			plazaId: plazaId,
			createdAt: new Date(),
			period: fromDate + ' to ' + toDate
		};
		if (obj && obj.beforeRate >= 0) {
			if (Object.keys(dheplPlazaObj || {}).length && obj.exitPlazaId) {
				historyObj.action = `Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" for payment method "${obj.paymentMethod}" changed from "${obj.beforeRate}" to "${obj.afterRate}" for "${dheplPlazaObj[String(plazaId)]}" to "${dheplPlazaObj[String(obj.exitPlazaId)]}"`;
			} else if (Object.keys(dheplPlazaObj || {}).length && !obj.exitPlazaId) {
				historyObj.action = `Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" for payment method "${obj.paymentMethod}" changed from "${obj.beforeRate}" to "${obj.afterRate}"`;
			} else if (entryPlazaId) {
				historyObj.entryPlazaId = ObjectId(entryPlazaId);
				historyObj.action = `Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeRate}" to "${obj.afterRate}" for "${plazaName}" to "${entryPlazaName}"`;
			} else {
				historyObj.action = `Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeRate}" to "${obj.afterRate}"`;
			}
		} else if (obj && obj.beforePenaltyRate >= 0) {
			if (obj.exitPlazaId && Object.keys(dheplPlazaObj || {}).length) {
				historyObj.action = `Penalty Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" for payment method "${obj.paymentMethod}" changed from "${obj.beforePenaltyRate}" to "${obj.afterPenaltyRate}" for "${dheplPlazaObj[String(plazaId)]}" to "${dheplPlazaObj[String(obj.exitPlazaId)]}"`;
			} else if (Object.keys(dheplPlazaObj || {}).length && !obj.exitPlazaId) {
				historyObj.action = `Penalty Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" for payment method "${obj.paymentMethod}" changed from "${obj.beforePenaltyRate}" to "${obj.afterPenaltyRate}"`;
			} else if (entryPlazaId) {
				historyObj.entryPlazaId = ObjectId(entryPlazaId);
				historyObj.action = `Penalty Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforePenaltyRate}" to "${obj.afterPenaltyRate}" for "${plazaName}" to "${entryPlazaName}"`;
			} else {
				historyObj.action = `Penalty Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforePenaltyRate}" to "${obj.afterPenaltyRate}"`;
			}
		}
		histories.push(historyObj);
	}
	if (histories && histories.length) {
		await Models.erpRateHistory.insertMany(histories);
	}
};

module.exports.createERPCardRatesHistory = async (fromDate, toDate, prevArray, updatedArray, user, plazaId, entryPlazaId, entryPlazaName, plazaName, dheplPlazaObj) => {
	const resArray = [];
	prevArray.forEach((e) => {
		let obj;
		if (dheplPlazaObj) {
			obj = updatedArray.find(o => o.vehicleType === e.vehicleType && o.journeyType === e.journeyType && String(o.exitPlazaId) === String(e.exitPlazaId));
		} else {
			obj = updatedArray.find(o => o.vehicleType === e.vehicleType && o.journeyType === e.journeyType);
		}
		if (!obj) return;
		if (e.depositRate !== obj.depositRate) {
			const resObj = {
				vehicleType: obj.vehicleType,
				journeyType: obj.journeyType,
				beforeDepositRate: e.depositRate,
				afterDepositRate: obj.depositRate
			};
			if (obj.exitPlazaId) resObj.exitPlazaId = ObjectId(obj.exitPlazaId);
			resArray.push(resObj);
		}
		if (e.rechargeRate !== obj.rechargeRate) {
			const resObj = {
				vehicleType: obj.vehicleType,
				journeyType: obj.journeyType,
				beforeRechargeRate: e.rechargeRate,
				afterRechargeRate: obj.rechargeRate
			};
			if (obj.exitPlazaId) resObj.exitPlazaId = ObjectId(obj.exitPlazaId);
			resArray.push(resObj);
		}
	});
	const histories = [];
	for (const obj of resArray) {
		const historyObj = {
			userId: user && user._id,
			plazaId: plazaId,
			createdAt: new Date(),
			period: fromDate + ' to ' + toDate
		};
		if (obj && obj.beforeDepositRate >= 0) {
			if (Object.keys(dheplPlazaObj || {}).length) {
				historyObj.action = `Deposit Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeDepositRate}" to "${obj.afterDepositRate}" for ${dheplPlazaObj[String(plazaId)]} to ${dheplPlazaObj[String(obj.exitPlazaId)]}`;
			} else if (entryPlazaId) {
				historyObj.entryPlazaId = ObjectId(entryPlazaId);
				historyObj.action = `Deposit Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeDepositRate}" to "${obj.afterDepositRate}" for ${plazaName} to ${entryPlazaName}`;
			} else {
				historyObj.action = `Deposit Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeDepositRate}" to "${obj.afterDepositRate}"`;
			}
		} else if (obj && obj.beforeRechargeRate >= 0) {
			if (Object.keys(dheplPlazaObj || {}).length) {
				historyObj.action = `Deposit Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeRechargeRate}" to "${obj.afterRechargeRate}" for "${dheplPlazaObj[String(plazaId)]}" to "${dheplPlazaObj[String(obj.exitPlazaId)]}"`;
			} else if (entryPlazaId) {
				historyObj.entryPlazaId = ObjectId(entryPlazaId);
				historyObj.action = `Recharge Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeRechargeRate}" to "${obj.afterRechargeRate} for ${plazaName} to ${entryPlazaName}"`;
			} else {
				historyObj.action = `Recharge Rate of vehicle "${obj.vehicleType}" for journey type "${obj.journeyType}" changed from "${obj.beforeRechargeRate}" to "${obj.afterRechargeRate}"`;
			}
		}
		histories.push(historyObj);
	}
	if (histories && histories.length) {
		await Models.erpRateHistory.insertMany(histories);
	}
};

module.exports.createRevenueCorrectionsHistory = async (type, user, date, plazaId, prevChargeBack, currChargeBack) => {
	if (type === 'CREATE') {
		await Models.revenueCorrectionsHistory.insertOne({
			userId: user && user._id,
			plazaId: plazaId,
			date: date,
			action: 'Revenue Corrections Created',
			createdAt: new Date()
		});
	} else if (type === 'UPDATE') {
		await Models.revenueCorrectionsHistory.insertOne({
			userId: user && user._id,
			plazaId: plazaId,
			date: date,
			action: 'Revenue Corrections Updated',
			createdAt: new Date()
		});
	}
	if (currChargeBack - prevChargeBack) {
		await Models.revenueCorrectionsHistory.insertOne({
			userId: user && user._id,
			plazaId: plazaId,
			date: date,
			action: `Monthly ChargeBack Amount Updated From "${prevChargeBack}" to "${currChargeBack}"`,
			createdAt: new Date()
		});
	}
};

module.exports.createMonthlyBankReconciliationHistory = async (type, user, date, plaza, prevBankData, currentBankData, wrongDaAmount, actualDaAmount, merchantDiscountRate, bankLiabilityAmount, monthlySettlementAmounts) => {
	const year = date.getFullYear(), month = date.getMonth() + 1;
	const monthEndLastDate = new Date(year, month, 0).getDate();
	if (type === 'CREATE') {
		await Models.monthlyBankReconciliationHistory.insertOne({
			userId: user && user._id,
			plazaId: plaza._id,
			date: date,
			action: 'Monthly Reconciliaitons Created',
			createdAt: new Date()
		});
	} else if (type === 'UPDATE') {
		const plazasObj = {};
		if (plaza.roadName === 'KHEPL' || (plaza.roadName === 'DHEPL' && plaza.plazaName !== 'Chharjarsi')) {
			const plazas = (config.plazas || []).filter(p => p.roadName === plaza.roadName);
			for (const p of plazas) {
				plazasObj[p._id] = p.plazaName;
			}
		}
		const history = [];
		let index = 0;
		for (const bankData of currentBankData) {
			const mainObj = {
				date: date,
				userId: user && user._id,
				plazaId: plaza._id
			};
			const fromDate = `${bankData.fromDate.getFullYear()}-${bankData.fromDate.getMonth() + 1}-${bankData.fromDate.getDate()}`;
			const toDate = `${bankData.toDate.getFullYear()}-${bankData.toDate.getMonth() + 1}-${bankData.toDate.getDate()}`;
			for (const currentTrafficData of bankData.bankEtcTrafficData) {
				let prevData = prevBankData.bankData[index].bankEtcTrafficData.find(obj => obj.paymentMethod === currentTrafficData.paymentMethod && obj.journeyType === currentTrafficData.journeyType && obj.vehicleType === currentTrafficData.vehicleType);
				if (currentTrafficData.entryPlazaId) {
					prevData = prevBankData.bankData[index].bankEtcTrafficData.find(obj => obj.paymentMethod === currentTrafficData.paymentMethod && obj.journeyType === currentTrafficData.journeyType && obj.vehicleType === currentTrafficData.vehicleType && String(obj.entryPlazaId) === String(currentTrafficData.entryPlazaId));
				}
				if (prevData && prevData.trafficNo !== currentTrafficData.trafficNo) {
					const obj = { ...mainObj };
					if (currentTrafficData.entryPlazaId) {
						obj.action = `Traffic Number of vehicle "${currentTrafficData.vehicleType}" for journey type "${currentTrafficData.journeyType}" changed from "${prevData.trafficNo}" to "${currentTrafficData.trafficNo}" for "${plazasObj[currentTrafficData.entryPlazaId]}" to "${plazasObj[plaza._id]}" for period "${fromDate}" to "${toDate}"`;
					} else {
						obj.action = `Traffic Number of vehicle "${currentTrafficData.vehicleType}" for journey type "${currentTrafficData.journeyType}" changed from "${prevData.trafficNo}" to "${currentTrafficData.trafficNo}" for period "${fromDate}" to "${toDate}"`;
					}
					obj.createdAt = new Date();
					history.push(obj);
				}
			}
			for (const currentRechargeData of bankData.bankEtcRechargeData) {
				let prevData = prevBankData.bankData[index].bankEtcRechargeData.find(obj => obj.paymentMethod === currentRechargeData.paymentMethod && obj.rechargeType === currentRechargeData.rechargeType && obj.vehicleType === currentRechargeData.vehicleType);
				if (currentRechargeData.exitPlazaId) {
					prevData = prevBankData.bankData[index].bankEtcRechargeData.find(obj => obj.paymentMethod === currentRechargeData.paymentMethod && obj.rechargeType === currentRechargeData.rechargeType && obj.vehicleType === currentRechargeData.vehicleType && String(obj.exitPlazaId) === String(currentRechargeData.exitPlazaId));
				}
				if (prevData && prevData.count !== currentRechargeData.count) {
					const obj = { ...mainObj };
					if (currentRechargeData.exitPlazaId) {
						obj.action = `Passes Traffic Count of vehicle "${currentRechargeData.vehicleType}" for recharge type "${currentRechargeData.rechargeType}" changed from "${prevData.count}" to "${currentRechargeData.count}" for "${plazasObj[plaza._id]}" to "${plazasObj[currentRechargeData.exitPlazaId]}" for period "${fromDate}" to "${toDate}"`;
					} else {
						obj.action = `Passes Traffic Count of vehicle "${currentRechargeData.vehicleType}" for recharge type "${currentRechargeData.rechargeType}" changed from "${prevData.count}" to "${currentRechargeData.count}" for period "${fromDate}" to "${toDate}"`;
					}
					obj.createdAt = new Date();
					history.push(obj);
				}
			}
			index++;
		}
		if (wrongDaAmount !== prevBankData.wrongDaAmount) {
			history.push({
				date: date,
				userId: user && user._id,
				plazaId: plaza._id,
				action: `Wrong DA Amount changed from "${prevBankData.wrongDaAmount}" to "${wrongDaAmount}"`,
				createdAt: new Date()
			});
		}
		if (actualDaAmount !== prevBankData.actualDaAmount) {
			history.push({
				date: date,
				userId: user && user._id,
				plazaId: plaza._id,
				action: `Actual DA Amount changed from "${prevBankData.actualDaAmount || 0}" to "${actualDaAmount}"`,
				createdAt: new Date()
			});
		}
		if (merchantDiscountRate !== prevBankData.merchantDiscountRate) {
			history.push({
				date: date,
				userId: user && user._id,
				plazaId: plaza._id,
				action: `Merchant Discount Rate changed from "${prevBankData.merchantDiscountRate || 0}" to "${merchantDiscountRate}"`,
				createdAt: new Date()
			});
		}
		if (bankLiabilityAmount !== prevBankData.bankLiabilityAmount) {
			history.push({
				date: date,
				userId: user && user._id,
				plazaId: plaza._id,
				action: `Bank Liability Amount changed from "${prevBankData.bankLiabilityAmount || 0}" to "${bankLiabilityAmount}"`,
				createdAt: new Date()
			});
		}
		if (prevBankData.monthlySettlementAmounts && Object.keys(prevBankData.monthlySettlementAmounts).length) {
			for (const payment of Object.keys(monthlySettlementAmounts)) {
				if (prevBankData.monthlySettlementAmounts[payment] != monthlySettlementAmounts[payment]) {
					history.push({
						date: date,
						userId: user && user._id,
						plazaId: plaza._id,
						action: `Monthly Settlement Amount of "${payment}" changed from "${prevBankData.monthlySettlementAmounts[payment] || 0}" to "${monthlySettlementAmounts[payment]}"`,
						createdAt: new Date()
					});
				}
			}
		}
		try {
			if (history.length) await Models.monthlyBankReconciliationHistory.insertMany(history);
		} catch (err) {
			logger.error(err.toString());
		}
	} else if (type === 'APPROVED') {
		await Models.monthlyBankReconciliationHistory.insertOne({
			userId: user && user._id,
			plazaId: plaza._id,
			date: date,
			action: 'Monthly Reconciliaitons Approved',
			createdAt: new Date()
		});
	} else if (type === 'REOPEN') {
		await Models.monthlyBankReconciliationHistory.insertOne({
			userId: user && user._id,
			plazaId: plaza._id,
			date: date,
			action: 'Monthly Reconciliaitons Reopened',
			createdAt: new Date()
		});
	} else if (type.includes('UPLOAD')) {
		await Models.monthlyBankReconciliationHistory.insertOne({
			userId: user && user._id,
			plazaId: plaza._id,
			date: date,
			action: type.split('-')[1] + ' File Uploaded Successfully For The Period ' + `${year}-${month}-1` + ' to ' + `${year}-${month}-${monthEndLastDate}`,
			createdAt: new Date()
		});
	} else if (type.includes('DELETE')) {
		await Models.monthlyBankReconciliationHistory.insertOne({
			userId: user && user._id,
			plazaId: plaza._id,
			date: date,
			action: type.split('-')[1] + ' File Deleted Successfully For The Period ' + + `${year}-${month}-1` + ' to ' + `${year}-${month}-${monthEndLastDate}`,
			createdAt: new Date()
		});
	}
};

module.exports.createSapClosingHistory = async (type, user, date, plazaId) => {
	let action;
	if (type === 'CREATE') {
		action = 'Sap Adjustments Data Created';
	} else if (type === 'UPDATE') {
		action = 'Sap Closing Data Updated';
	} else if (type === 'APPROVED') {
		action = 'Sap Adjustments Data Approved';
	} else if (type === 'REOPEN') {
		action = 'Sap Adjustments Data Reopened';
	}
	if (!action) return;
	try {
		await Models.sapAdjustmentsHistory.insertOne({
			userId: user && user._id,
			plazaId: plazaId,
			date: date,
			action,
			createdAt: new Date()
		});
	} catch (err) {
		throw new Error(err);
	}
};

module.exports.createErpratesRemarksHistory = async (fromDate, toDate, prevRemarks, currRemarks, user, plazaId, entryPlazaId) => {
	let action = currRemarks;
	if (!prevRemarks && currRemarks.length) {
		action = `Remarks: "${currRemarks}"`;
	} else if (prevRemarks.length && currRemarks.length && prevRemarks.trim().toLowerCase() !== currRemarks.trim().toLowerCase()) {
		action = `Remarks updated from "${prevRemarks}" to "${currRemarks}"`;
	} else {
		return;
	}
	const query = {
		userId: user && user._id,
		plazaId: plazaId,
		period: fromDate + ' to ' + toDate
	};
	if (entryPlazaId) {
		query.entryPlazaId = ObjectId(entryPlazaId);
	}
	query.action = action;
	query.createdAt = new Date();
	try {
		await Models.erpRateHistory.insertOne(query);
	} catch (err) {
		throw new Error(err);
	}
};

module.exports.createErpRatesStatusHistory = async (erpRate, status, userId, fromDate, toDate) => {
	const query = {
		plazaId: erpRate.plazaId,
		userId: userId,
		action: `ERP Rates ${status} Successfully`,
		period: fromDate + ' to ' + toDate,
		createdAt: new Date()
	};
	if (erpRate.entryPlazaId) {
		query.entryPlazaId = erpRate.entryPlazaId;
	}
	try {
		await Models.erpRateHistory.insertOne(query);
	} catch (err) {
		throw new Error(err);
	}
};

module.exports.createExemptionAndViolationHistory = async (type, user, date, plazaId) => {
	let action = 'Exemption & Violation Updated';
	if (type === 'CREATE') {
		action = 'Exemption & Violation Created';
	}
	await Models.exemptionViolationHistory.insertOne({
		userId: user && user._id,
		plazaId: ObjectId(plazaId),
		date: new Date(date),
		action,
		createdAt: new Date()
	});
};

module.exports.createDeltaEditHistory = async (status, user, date, plazaId) => {
	try {
		await Models.DeltaEditHistory.insertOne({
			userId: user && user._id,
			plazaId: ObjectId(plazaId),
			date: new Date(date),
			action: `Monthly Revenue Corrections ${status} Successfully`,
			createdAt: new Date()
		});
	} catch (err) {
		throw new Error(err);
	}
};

module.exports.createPcuValuesHistory = async (type, user, fromDate, toDate, plazaId, prevPcuValues, curPcuValues) => {
	const period = fromDate.toCustomDate() + ' - ' + toDate.toCustomDate();
	let resArr = [
		{
			userId: user && user._id,
			plazaId: ObjectId(plazaId),
			fromDate,
			toDate,
			period,
			action: 'PCU Values Created',
			createdAt: new Date()
		}
	];
	if (type === 'UPDATE') {
		resArr = [];
		for (const prev of prevPcuValues) {
			const curValue = curPcuValues.find(c => c.vehicleType === prev.vehicleType);
			if (curValue && prev.pcuValue !== curValue.pcuValue) {
				resArr.push({
					userId: user && user._id,
					plazaId: ObjectId(plazaId),
					fromDate,
					toDate,
					period,
					action: `PCU Value Of "${prev.vehicleType}" changed from "${prev.pcuValue}" to "${curValue.pcuValue}"`,
					createdAt: new Date()
				});
			}
		}
	}
	try {
		if (resArr.length) await Models.pcuValuesHistory.insertMany(resArr);
	} catch (err) {
		throw new Error(err);
	}
};

module.exports.createDepositDetailsHistory = async (type, plazaId, depositDate, depositRecordId, userId) => {
	let action = 'Deposit Details Created';
	if (type === 'UPDATE') {
		action = 'Deposit Details Updated';
	}
	if (type === 'DELETE') {
		action = 'Bifurcated Details Deleted';
	}
	try {
		await Models.depositDetailsHistory.insertOne({
			plazaId: ObjectId(plazaId),
			depositDate: new Date(depositDate),
			depositRecordId,
			action,
			userId,
			createdAt: new Date()
		});
	} catch (err) {
		throw new Error(err);
	}
};


